import { mistral } from '@ai-sdk/mistral'
import { attachment, bankTransaction, createDb } from '@bank-data/db'
import { logger, schemaTask } from '@trigger.dev/sdk'
import { generateText, Output } from 'ai'
import { and, eq, gte, lte } from 'drizzle-orm'
import { z } from 'zod'

const payloadSchema = z.object({
  workspaceId: z.uuid(),
})

export type MatchPendingAttachmentsPayload = z.infer<typeof payloadSchema>

const matchResultSchema = z.object({
  transactionId: z
    .string()
    .nullable()
    .describe('The id of the best matching transaction, or null if no confident match is found'),
  confidence: z.enum(['high', 'medium', 'low']).describe('Confidence level of the match'),
  reason: z
    .string()
    .describe('Brief explanation of why this transaction was selected, or why no match was found'),
})

export const matchPendingAttachmentsTask = schemaTask({
  id: 'match-pending-attachments',
  schema: payloadSchema,
  run: async (payload) => {
    const db = createDb()

    const pendingAttachments = await db.query.attachment.findMany({
      where: (table, { and, eq, isNotNull }) =>
        and(
          eq(table.workspaceId, payload.workspaceId),
          eq(table.status, 'unmatched'),
          isNotNull(table.parsedInvoice),
        ),
    })

    logger.info('Scanning unmatched attachments', {
      workspaceId: payload.workspaceId,
      count: pendingAttachments.length,
    })

    let matched = 0

    for (const att of pendingAttachments) {
      const invoiceDateStr = att.parsedInvoice?.invoiceDate ?? att.parsedInvoice?.dueDate

      if (!invoiceDateStr) {
        logger.info('Skipping attachment with no invoice date', { attachmentId: att.id })
        continue
      }

      const invoiceDate = new Date(invoiceDateStr)
      const from = new Date(invoiceDate)
      from.setDate(from.getDate() - 15)
      const to = new Date(invoiceDate)
      to.setDate(to.getDate() + 5)

      const candidates = await db
        .select({
          id: bankTransaction.id,
          bookedAt: bankTransaction.bookedAt,
          amount: bankTransaction.amount,
          currency: bankTransaction.currency,
          merchantName: bankTransaction.merchantName,
          description: bankTransaction.description,
        })
        .from(bankTransaction)
        .where(
          and(
            eq(bankTransaction.workspaceId, payload.workspaceId),
            gte(bankTransaction.bookedAt, from),
            lte(bankTransaction.bookedAt, to),
          ),
        )

      if (candidates.length === 0) {
        logger.info('No candidate transactions in window', {
          attachmentId: att.id,
          from: from.toISOString(),
          to: to.toISOString(),
        })
        continue
      }

      const compressed = candidates.map((t) => ({
        id: t.id,
        date: t.bookedAt.toISOString().split('T')[0],
        amount: t.amount,
        currency: t.currency,
        name: t.merchantName ?? t.description,
      }))

      const { output } = await generateText({
        model: mistral('mistral-large-latest'),
        output: Output.object({ schema: matchResultSchema }),
        prompt: `You are matching an invoice or receipt to a bank transaction.

Invoice metadata:
${JSON.stringify(att.parsedInvoice, null, 2)}

Candidate transactions (within ±15/+5 days of invoice date):
${JSON.stringify(compressed, null, 2)}

Pick the transaction that best matches this invoice. Consider:
- Amount similarity (the invoice may be in a different currency for foreign purchases — use judgment on FX rates)
- Vendor/merchant name similarity
- Date proximity to the invoice date

Return null for transactionId if no transaction is a plausible match. Only return high or medium confidence when you are reasonably sure.`,
      })

      if (!output || !output.transactionId || output.confidence === 'low') {
        logger.info('No confident match found', {
          attachmentId: att.id,
          confidence: output?.confidence,
          reason: output?.reason,
        })
        continue
      }

      // Guard against hallucinated IDs
      const confirmedCandidate = candidates.find((t) => t.id === output.transactionId)
      if (!confirmedCandidate) {
        logger.warn('LLM returned transaction ID not in candidate list', {
          attachmentId: att.id,
          transactionId: output.transactionId,
        })
        continue
      }

      await db
        .update(attachment)
        .set({ suggestedTransactionId: output.transactionId, status: 'suggested' })
        .where(eq(attachment.id, att.id))

      matched++
      logger.info('Suggested match stored', {
        attachmentId: att.id,
        transactionId: output.transactionId,
        confidence: output.confidence,
        reason: output.reason,
      })
    }

    return { processed: pendingAttachments.length, matched }
  },
})
