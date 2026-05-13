import { createDb } from '@bank-data/db'
import { attachment, bankTransaction } from '@bank-data/db/schema'
import { createStorageClient } from '@bank-data/storage'
import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'

import { getOrCreateWorkspace, getServerSession } from '#/features/banking/shared'
import { createShortId } from '#/lib/short-id'

type AttachmentIdInput = {
  attachmentId: string
}

type TransactionIdInput = {
  transactionId: string
}

type InboxStatusFilter = 'all' | 'matched' | 'unmatched'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']

function buildS3Key(workspaceId: string, filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  const stem = lastDot > 0 ? filename.slice(0, lastDot) : filename
  const ext = lastDot > 0 ? filename.slice(lastDot) : ''
  const shortId = createShortId()
  const safeStem = stem.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)
  return `${workspaceId}/attachments/${safeStem}-${shortId}${ext}`
}

export const uploadAttachments = createServerFn({ method: 'POST' })
  .inputValidator((input: FormData) => input)
  .handler(async ({ data }) => {
    const session = await getServerSession()
    const db = createDb()
    const workspace = await getOrCreateWorkspace(session.user.id)

    const transactionId = (data.get('transactionId') as string | null) ?? null
    const source = (data.get('source') as 'manual' | 'email' | null) ?? 'manual'
    const files = data.getAll('files') as File[]

    if (files.length === 0) {
      throw new Error('No files provided')
    }

    const invalidFile = files.find((f) => !ALLOWED_MIME_TYPES.includes(f.type))
    if (invalidFile) {
      throw new Error(`File type not allowed: ${invalidFile.type}`)
    }

    const storage = createStorageClient()
    const inserted: Array<typeof attachment.$inferSelect> = []

    for (const file of files) {
      const key = buildS3Key(workspace.id, file.name)
      const buffer = Buffer.from(await file.arrayBuffer())

      await storage.putObject({ key, body: buffer, contentType: file.type })

      const [row] = await db
        .insert(attachment)
        .values({
          workspaceId: workspace.id,
          transactionId: transactionId ?? null,
          status: transactionId ? 'matched' : 'unmatched',
          source,
          s3Key: key,
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        })
        .returning()

      inserted.push(row)
    }

    return { uploaded: inserted.length }
  })

export const getInboxAttachments = createServerFn({ method: 'GET' })
  .inputValidator((input: { status: InboxStatusFilter }) => input)
  .handler(async ({ data }) => {
    const session = await getServerSession()
    const db = createDb()
    const workspace = await getOrCreateWorkspace(session.user.id)
    const storage = createStorageClient()

    const statusCondition =
      data.status === 'matched'
        ? isNotNull(attachment.transactionId)
        : data.status === 'unmatched'
          ? isNull(attachment.transactionId)
          : undefined

    const rows = await db
      .select({
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        status: attachment.status,
        source: attachment.source,
        s3Key: attachment.s3Key,
        createdAt: attachment.createdAt,
        transactionId: bankTransaction.id,
        transactionDescription: bankTransaction.description,
        transactionMerchantName: bankTransaction.merchantName,
        transactionAmount: bankTransaction.amount,
        transactionCurrency: bankTransaction.currency,
        transactionBookedAt: bankTransaction.bookedAt,
      })
      .from(attachment)
      .leftJoin(bankTransaction, eq(attachment.transactionId, bankTransaction.id))
      .where(and(eq(attachment.workspaceId, workspace.id), statusCondition))
      .orderBy(desc(attachment.createdAt))

    const result = await Promise.all(
      rows.map(async (row) => {
        const signedUrl = await storage.getSignedReadUrl(row.s3Key, 60 * 15)

        return {
          id: row.id,
          filename: row.filename,
          contentType: row.contentType,
          sizeBytes: row.sizeBytes,
          status: row.status,
          source: row.source,
          createdAt: row.createdAt.toISOString(),
          signedUrl,
          transaction: row.transactionId
            ? {
                id: row.transactionId,
                description: row.transactionDescription ?? '',
                merchantName: row.transactionMerchantName,
                amount: row.transactionAmount ?? '0',
                currency: row.transactionCurrency ?? '',
                bookedAt: row.transactionBookedAt?.toISOString() ?? '',
              }
            : null,
        }
      }),
    )

    return result
  })

export const linkAttachmentToTransaction = createServerFn({ method: 'POST' })
  .inputValidator((input: { attachmentId: string; transactionId: string }) => input)
  .handler(async ({ data }) => {
    const session = await getServerSession()
    const db = createDb()
    const workspace = await getOrCreateWorkspace(session.user.id)

    const [updated] = await db
      .update(attachment)
      .set({ transactionId: data.transactionId, status: 'matched' })
      .where(and(eq(attachment.id, data.attachmentId), eq(attachment.workspaceId, workspace.id)))
      .returning()

    if (!updated) {
      throw new Error('Attachment not found')
    }

    return { ok: true }
  })

export const unlinkAttachment = createServerFn({ method: 'POST' })
  .inputValidator((input: AttachmentIdInput) => input)
  .handler(async ({ data }) => {
    const session = await getServerSession()
    const db = createDb()
    const workspace = await getOrCreateWorkspace(session.user.id)

    const [updated] = await db
      .update(attachment)
      .set({ transactionId: null, status: 'unmatched' })
      .where(and(eq(attachment.id, data.attachmentId), eq(attachment.workspaceId, workspace.id)))
      .returning()

    if (!updated) {
      throw new Error('Attachment not found')
    }

    return { ok: true }
  })

export const getTransactionAttachments = createServerFn({ method: 'GET' })
  .inputValidator((input: TransactionIdInput) => input)
  .handler(async ({ data }) => {
    const session = await getServerSession()
    const db = createDb()
    const workspace = await getOrCreateWorkspace(session.user.id)

    const rows = await db.query.attachment.findMany({
      where: (table, { eq, and }) =>
        and(eq(table.workspaceId, workspace.id), eq(table.transactionId, data.transactionId)),
      orderBy: (table, { asc }) => [asc(table.createdAt)],
    })

    return rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt.toISOString(),
    }))
  })

export const getAttachmentSignedUrl = createServerFn({ method: 'GET' })
  .inputValidator((input: AttachmentIdInput) => input)
  .handler(async ({ data }) => {
    const session = await getServerSession()
    const db = createDb()
    const workspace = await getOrCreateWorkspace(session.user.id)

    const row = await db.query.attachment.findFirst({
      where: (table, { eq, and }) =>
        and(eq(table.id, data.attachmentId), eq(table.workspaceId, workspace.id)),
    })

    if (!row) {
      throw new Error('Attachment not found')
    }

    const storage = createStorageClient()
    const url = await storage.getSignedReadUrl(row.s3Key, 60 * 15)

    return { url }
  })

export const deleteAttachment = createServerFn({ method: 'POST' })
  .inputValidator((input: AttachmentIdInput) => input)
  .handler(async ({ data }) => {
    const session = await getServerSession()
    const db = createDb()
    const workspace = await getOrCreateWorkspace(session.user.id)

    const [deleted] = await db
      .delete(attachment)
      .where(and(eq(attachment.id, data.attachmentId), eq(attachment.workspaceId, workspace.id)))
      .returning()

    if (!deleted) {
      throw new Error('Attachment not found')
    }

    const storage = createStorageClient()
    await storage.deleteObject(deleted.s3Key)

    return { ok: true }
  })
