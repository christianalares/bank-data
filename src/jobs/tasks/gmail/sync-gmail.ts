import { createHash } from 'node:crypto'
import { logger, task } from '@trigger.dev/sdk'
import { eq } from 'drizzle-orm'
import { attachment, createDb, gmailConnection, gmailImportedRef } from '#db'
import { createStorageClient } from '#storage'
import { decrypt, encrypt } from '../../lib/crypto'
import { downloadPdfAttachment, listPdfAttachments, refreshAccessToken } from '../../lib/gmail'
import { processAttachmentTask } from '../process-attachment'

function buildS3Key(workspaceId: string, filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  const stem = lastDot > 0 ? filename.slice(0, lastDot) : filename
  const ext = lastDot > 0 ? filename.slice(lastDot) : ''
  const shortId = createHash('md5').update(`${Date.now()}_${filename}`).digest('hex').slice(0, 8)
  const safeStem = stem.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)
  return `${workspaceId}/attachments/${safeStem}-${shortId}${ext}`
}

export const syncGmailInboxTask = task({
  id: 'sync-gmail-inbox',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 10_000,
    maxTimeoutInMs: 60_000,
    factor: 2,
  },
  run: async () => {
    const db = createDb()

    const connection = await db.query.gmailConnection.findFirst()
    if (!connection) {
      logger.info('No Gmail connection found — skipping sync')
      return { skipped: true }
    }

    const ws = await db.query.workspace.findFirst({
      where: (table, { eq }) => eq(table.id, connection.workspaceId),
    })
    if (!ws) {
      logger.error('No workspace found')
      return { skipped: true }
    }

    let accessToken = decrypt(connection.accessToken)

    // Refresh if expired (or within 5 minutes of expiry)
    const needsRefresh =
      connection.expiresAt && connection.expiresAt.getTime() < Date.now() + 5 * 60 * 1000

    if (needsRefresh && connection.refreshToken) {
      logger.info('Refreshing Gmail access token')
      const refreshToken = decrypt(connection.refreshToken)
      const credentials = await refreshAccessToken(refreshToken)

      accessToken = credentials.access_token!

      await db
        .update(gmailConnection)
        .set({
          accessToken: encrypt(accessToken),
          expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
        })
        .where(eq(gmailConnection.id, connection.id))
    }

    logger.info('Listing PDF attachments from Gmail', {
      lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? 'never',
    })

    // Fetch metadata only — no binary data yet, so we don't blow the worker's RAM
    const attachmentMetas = await listPdfAttachments(accessToken, connection.lastSyncedAt)

    logger.info(`Found ${attachmentMetas.length} PDF attachment(s) from Gmail`)

    const storage = createStorageClient()
    let imported = 0
    let skipped = 0

    for (const meta of attachmentMetas) {
      // Skip if already imported — checked against the permanent ref table so
      // deleting an attachment from the inbox does not cause a re-import
      const alreadyImported = await db.query.gmailImportedRef.findFirst({
        where: (table, { eq }) => eq(table.referenceId, meta.referenceId),
      })

      if (alreadyImported) {
        skipped++
        continue
      }

      // Download binary data for this one attachment only — keeps peak memory low
      const data = await downloadPdfAttachment(accessToken, meta.messageId, meta.attachmentId)
      const sizeBytes = data.byteLength

      const s3Key = buildS3Key(ws.id, meta.filename)
      await storage.putObject({ key: s3Key, body: data, contentType: 'application/pdf' })

      const [row] = await db
        .insert(attachment)
        .values({
          workspaceId: ws.id,
          status: 'unmatched',
          source: 'email',
          s3Key,
          filename: meta.filename,
          contentType: 'application/pdf',
          sizeBytes,
          referenceId: meta.referenceId,
        })
        .returning()

      // Record permanently so future syncs skip this even if the attachment is deleted
      await db.insert(gmailImportedRef).values({ referenceId: meta.referenceId })

      // Process one PDF at a time and pause between each to stay within
      // Mistral's rate limit window
      await processAttachmentTask.triggerAndWait({
        attachmentStorageKey: s3Key,
        correlationId: row.id,
        workspaceId: ws.id,
        contentType: 'application/pdf',
      })

      imported++
    }

    await db
      .update(gmailConnection)
      .set({ lastSyncedAt: new Date() })
      .where(eq(gmailConnection.id, connection.id))

    logger.info('Gmail sync complete', { imported, skipped })
    return { imported, skipped }
  },
})
