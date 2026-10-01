import { createServerFn } from '@tanstack/react-start'
import { tasks } from '@trigger.dev/sdk'
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { getOrCreateWorkspace } from '#/features/banking/shared'
import { authMiddleware } from '#/lib/middleware'
import { createShortId } from '#/lib/short-id'
import {
  attachmentSelectSchema,
  bankTransactionSelectSchema,
  createDb,
  type DatabaseTable,
} from '#db'
import { attachment, attachmentSuggestionDismissal, bankTransaction } from '#db/schema'
import type { processAttachmentTask } from '#jobs'
import { createStorageClient } from '#storage'

const attachmentIdSchema = z.object({ attachmentId: attachmentSelectSchema.shape.id })
const transactionIdSchema = z.object({ transactionId: bankTransactionSelectSchema.shape.id })
const linkSchema = z.object({
  attachmentId: attachmentSelectSchema.shape.id,
  transactionId: bankTransactionSelectSchema.shape.id,
})
const inboxStatusSchema = z.object({
  status: z.enum(['all', 'matched', 'unmatched']),
})

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
] as const

type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number]

function buildS3Key(workspaceId: string, filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  const stem = lastDot > 0 ? filename.slice(0, lastDot) : filename
  const ext = lastDot > 0 ? filename.slice(lastDot) : ''
  const shortId = createShortId()
  const safeStem = stem.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)
  return `${workspaceId}/attachments/${safeStem}-${shortId}${ext}`
}

const uploadInputSchema = z.object({
  transactionId: bankTransactionSelectSchema.shape.id.nullable(),
  source: attachmentSelectSchema.shape.source.default('manual'),
  files: z
    .array(z.instanceof(File))
    .min(1, 'No files provided')
    .refine(
      (files) => files.every((f) => ALLOWED_MIME_TYPES.includes(f.type as AllowedMimeType)),
      'One or more files have an unsupported type',
    ),
})

export const uploadAttachments = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((formData: FormData) =>
    uploadInputSchema.parse({
      transactionId: formData.get('transactionId') ?? null,
      source: formData.get('source') ?? undefined,
      files: formData.getAll('files'),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = createDb()
    const workspace = await getOrCreateWorkspace(context.session.user.id)

    const { transactionId, source, files } = data

    const storage = createStorageClient()
    const inserted: DatabaseTable.Attachment[] = []

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
          contentType: file.type as AllowedMimeType,
          sizeBytes: file.size,
        })
        .returning()

      inserted.push(row)

      const isProcessable = file.type === 'application/pdf' || file.type.startsWith('image/')

      if (!transactionId && isProcessable) {
        await tasks.trigger<typeof processAttachmentTask>('process-attachment', {
          attachmentStorageKey: key,
          correlationId: row.id,
          workspaceId: workspace.id,
          contentType: file.type as AllowedMimeType,
        })
      }
    }

    return { uploaded: inserted.length }
  })

export const getInboxAttachments = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator(inboxStatusSchema)
  .handler(async ({ data, context }) => {
    const db = createDb()
    const workspace = await getOrCreateWorkspace(context.session.user.id)
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
        parsedInvoice: attachment.parsedInvoice,
        createdAt: attachment.createdAt,
        suggestedTransactionId: attachment.suggestedTransactionId,
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

    // Batch-fetch suggested transactions in a single query to avoid N+1
    const suggestedIds = [
      ...new Set(
        rows.map((r) => r.suggestedTransactionId).filter((id): id is string => id != null),
      ),
    ]
    const suggestedTxMap = new Map<
      string,
      {
        id: string
        description: string
        merchantName: string | null
        amount: string
        currency: string
        bookedAt: string
      }
    >()
    if (suggestedIds.length > 0) {
      const suggestedRows = await db
        .select({
          id: bankTransaction.id,
          description: bankTransaction.description,
          merchantName: bankTransaction.merchantName,
          amount: bankTransaction.amount,
          currency: bankTransaction.currency,
          bookedAt: bankTransaction.bookedAt,
        })
        .from(bankTransaction)
        .where(inArray(bankTransaction.id, suggestedIds))

      for (const t of suggestedRows) {
        suggestedTxMap.set(t.id, {
          id: t.id,
          description: t.description,
          merchantName: t.merchantName,
          amount: t.amount,
          currency: t.currency,
          bookedAt: t.bookedAt.toISOString(),
        })
      }
    }

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
          parsedInvoice: row.parsedInvoice ?? null,
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
          suggestedTransaction: row.suggestedTransactionId
            ? (suggestedTxMap.get(row.suggestedTransactionId) ?? null)
            : null,
        }
      }),
    )

    return result
  })

export const linkAttachmentToTransaction = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(linkSchema)
  .handler(async ({ data, context }) => {
    const db = createDb()
    const workspace = await getOrCreateWorkspace(context.session.user.id)
    const transaction = await db.query.bankTransaction.findFirst({
      where: (table, { and, eq }) =>
        and(eq(table.id, data.transactionId), eq(table.workspaceId, workspace.id)),
      columns: { id: true },
    })

    if (!transaction) {
      throw new Error('Transaction not found')
    }

    const [updated] = await db
      .update(attachment)
      .set({ transactionId: data.transactionId, suggestedTransactionId: null, status: 'matched' })
      .where(and(eq(attachment.id, data.attachmentId), eq(attachment.workspaceId, workspace.id)))
      .returning()

    if (!updated) {
      throw new Error('Attachment not found')
    }

    return { ok: true }
  })

export const approveSuggestedMatch = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(attachmentIdSchema)
  .handler(async ({ data, context }) => {
    const db = createDb()
    const workspace = await getOrCreateWorkspace(context.session.user.id)

    const row = await db.query.attachment.findFirst({
      where: (table, { and, eq }) =>
        and(eq(table.id, data.attachmentId), eq(table.workspaceId, workspace.id)),
    })

    if (!row?.suggestedTransactionId || row.status !== 'suggested' || row.transactionId !== null) {
      throw new Error('No suggested match to approve')
    }

    const suggestedTransactionId = row.suggestedTransactionId
    const transaction = await db.query.bankTransaction.findFirst({
      where: (table, { and, eq }) =>
        and(eq(table.id, suggestedTransactionId), eq(table.workspaceId, workspace.id)),
      columns: { id: true },
    })

    if (!transaction) {
      throw new Error('Suggested transaction not found')
    }

    const [updated] = await db
      .update(attachment)
      .set({
        transactionId: suggestedTransactionId,
        suggestedTransactionId: null,
        status: 'matched',
      })
      .where(
        and(
          eq(attachment.id, data.attachmentId),
          eq(attachment.workspaceId, workspace.id),
          eq(attachment.status, 'suggested'),
          isNull(attachment.transactionId),
          eq(attachment.suggestedTransactionId, suggestedTransactionId),
        ),
      )
      .returning()

    if (!updated) {
      throw new Error('Attachment not found')
    }

    return { ok: true }
  })

export const dismissSuggestedMatch = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(attachmentIdSchema)
  .handler(async ({ data, context }) => {
    const db = createDb()
    const workspace = await getOrCreateWorkspace(context.session.user.id)
    const row = await db.query.attachment.findFirst({
      where: (table, { and, eq }) =>
        and(eq(table.id, data.attachmentId), eq(table.workspaceId, workspace.id)),
    })

    if (!row?.suggestedTransactionId || row.status !== 'suggested' || row.transactionId !== null) {
      throw new Error('No suggested match to dismiss')
    }

    const suggestedTransactionId = row.suggestedTransactionId
    await db.transaction(async (tx) => {
      await tx
        .insert(attachmentSuggestionDismissal)
        .values({
          workspaceId: workspace.id,
          attachmentId: data.attachmentId,
          transactionId: suggestedTransactionId,
        })
        .onConflictDoNothing()

      const [updated] = await tx
        .update(attachment)
        .set({ suggestedTransactionId: null, status: 'unmatched' })
        .where(
          and(
            eq(attachment.id, data.attachmentId),
            eq(attachment.workspaceId, workspace.id),
            eq(attachment.status, 'suggested'),
            isNull(attachment.transactionId),
            eq(attachment.suggestedTransactionId, suggestedTransactionId),
          ),
        )
        .returning()

      if (!updated) {
        throw new Error('Suggestion changed before it could be dismissed')
      }
    })

    return { ok: true }
  })

export const unlinkAttachment = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(attachmentIdSchema)
  .handler(async ({ data, context }) => {
    const db = createDb()
    const workspace = await getOrCreateWorkspace(context.session.user.id)

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
  .middleware([authMiddleware])
  .inputValidator(transactionIdSchema)
  .handler(async ({ data, context }) => {
    const db = createDb()
    const workspace = await getOrCreateWorkspace(context.session.user.id)

    const rows = await db.query.attachment.findMany({
      where: (table, { eq, and }) =>
        and(eq(table.workspaceId, workspace.id), eq(table.transactionId, data.transactionId)),
      orderBy: (table, { asc }) => [asc(table.createdAt)],
    })

    const storage = createStorageClient()
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        filename: row.filename,
        contentType: row.contentType,
        sizeBytes: row.sizeBytes,
        createdAt: row.createdAt.toISOString(),
        signedUrl: await storage.getSignedReadUrl(row.s3Key, 60 * 15),
      })),
    )
  })

export const getSuggestedAttachmentsForTransaction = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator(transactionIdSchema)
  .handler(async ({ data, context }) => {
    const db = createDb()
    const workspace = await getOrCreateWorkspace(context.session.user.id)

    const rows = await db.query.attachment.findMany({
      where: (table, { eq, and }) =>
        and(
          eq(table.workspaceId, workspace.id),
          eq(table.suggestedTransactionId, data.transactionId),
          eq(table.status, 'suggested'),
        ),
      orderBy: (table, { asc }) => [asc(table.createdAt)],
    })

    const storage = createStorageClient()
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        filename: row.filename,
        contentType: row.contentType,
        sizeBytes: row.sizeBytes,
        createdAt: row.createdAt.toISOString(),
        signedUrl: await storage.getSignedReadUrl(row.s3Key, 60 * 15),
      })),
    )
  })

export const getAttachmentSignedUrl = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator(attachmentIdSchema)
  .handler(async ({ data, context }) => {
    const db = createDb()
    const workspace = await getOrCreateWorkspace(context.session.user.id)

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
  .middleware([authMiddleware])
  .inputValidator(attachmentIdSchema)
  .handler(async ({ data, context }) => {
    const db = createDb()
    const workspace = await getOrCreateWorkspace(context.session.user.id)

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
