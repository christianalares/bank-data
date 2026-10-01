import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { strToU8, type Zippable, zipSync } from 'fflate'
import { z } from 'zod'
import { getOrCreateWorkspace } from '#/features/banking/shared'
import { authMiddleware } from '#/lib/middleware'
import { bankTransactionSelectSchema, createDb } from '#db'
import { attachment } from '#db/schema'
import { createStorageClient } from '#storage'

const exportInputSchema = z.object({
  transactionIds: z.array(bankTransactionSelectSchema.shape.id).min(1, 'No transactions selected'),
})

const CSV_HEADER = ['Date', 'Description', 'Amount', 'Attachment', 'Note'] as const

const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function formatExportDate(isoDate: string): string {
  return dateFormatter.format(new Date(isoDate))
}

// Swedish-style currency, normalized to plain ASCII (hyphen + regular space) so it
// stays readable in CSV/Excel, e.g. "-505,00 kr".
function formatExportAmount(amount: string, currency: string): string {
  const value = Number(amount)
  const formatted = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency,
  }).format(Number.isFinite(value) ? value : 0)

  return formatted.replace(/\u2212/g, '-').replace(/[\u00a0\u202f]/g, ' ')
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}

function buildCsvRow(fields: readonly string[]): string {
  return fields.map(escapeCsvField).join(',')
}

// Keeps attachment filenames unique within the flat attachments/ folder by
// suffixing duplicates (invoice.pdf -> invoice_1.pdf).
function uniqueFilename(used: Set<string>, filename: string): string {
  if (!used.has(filename)) {
    used.add(filename)
    return filename
  }

  const lastDot = filename.lastIndexOf('.')
  const stem = lastDot > 0 ? filename.slice(0, lastDot) : filename
  const ext = lastDot > 0 ? filename.slice(lastDot) : ''

  let index = 1
  let candidate = `${stem}_${index}${ext}`

  while (used.has(candidate)) {
    index += 1
    candidate = `${stem}_${index}${ext}`
  }

  used.add(candidate)
  return candidate
}

function buildExportFolderName(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`

  return `export-${stamp}`
}

export const exportTransactions = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(exportInputSchema)
  .handler(async ({ data, context }) => {
    const db = createDb()
    const workspace = await getOrCreateWorkspace(context.session.user.id)

    const transactions = await db.query.bankTransaction.findMany({
      where: (table, { and: andOp, eq: eqOp, inArray: inArrayOp }) =>
        andOp(eqOp(table.workspaceId, workspace.id), inArrayOp(table.id, data.transactionIds)),
    })

    if (transactions.length === 0) {
      throw new Error('No matching transactions found')
    }

    const attachmentRows = await db
      .select({
        id: attachment.id,
        transactionId: attachment.transactionId,
        filename: attachment.filename,
        s3Key: attachment.s3Key,
      })
      .from(attachment)
      .where(
        and(
          eq(attachment.workspaceId, workspace.id),
          inArray(attachment.transactionId, data.transactionIds),
        ),
      )
      .orderBy(asc(attachment.createdAt))

    const attachmentsByTransaction = new Map<string, typeof attachmentRows>()
    for (const row of attachmentRows) {
      if (!row.transactionId) {
        continue
      }
      const list = attachmentsByTransaction.get(row.transactionId) ?? []
      list.push(row)
      attachmentsByTransaction.set(row.transactionId, list)
    }

    // Preserve the order the rows were selected/displayed in (client sends them
    // in table order, which is date descending).
    const orderById = new Map(data.transactionIds.map((id, index) => [id, index]))
    transactions.sort(
      (first, second) => (orderById.get(first.id) ?? 0) - (orderById.get(second.id) ?? 0),
    )

    const storage = createStorageClient()
    const now = new Date()
    const folderName = buildExportFolderName(now)

    const usedFilenames = new Set<string>()
    const zipFiles: Zippable = {}

    const csvLines: string[] = [buildCsvRow(CSV_HEADER)]

    for (const transaction of transactions) {
      const txAttachments = attachmentsByTransaction.get(transaction.id) ?? []
      const finalFilenames: string[] = []

      for (const att of txAttachments) {
        const bytes = await storage.getObjectBytes(att.s3Key)
        const finalName = uniqueFilename(usedFilenames, att.filename)
        finalFilenames.push(finalName)
        // PDFs/images are already compressed — skip re-compression (level 0).
        zipFiles[`${folderName}/attachments/${finalName}`] = [new Uint8Array(bytes), { level: 0 }]
      }

      csvLines.push(
        buildCsvRow([
          formatExportDate(transaction.bookedAt.toISOString()),
          transaction.description,
          formatExportAmount(transaction.amount, transaction.currency),
          finalFilenames.join(', '),
          transaction.note ?? '',
        ]),
      )
    }

    // UTF-8 BOM so Excel renders Swedish characters (å/ä/ö) correctly.
    const csv = `\uFEFF${csvLines.join('\r\n')}\r\n`
    zipFiles[`${folderName}/transactions.csv`] = [strToU8(csv), { level: 6 }]

    const zipBytes = zipSync(zipFiles, { mtime: now })
    const fileName = `${folderName}.zip`

    return new Response(new Uint8Array(zipBytes), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'X-Export-Filename': fileName,
      },
    })
  })
