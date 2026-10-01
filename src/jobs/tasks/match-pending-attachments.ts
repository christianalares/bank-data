import { mistral } from '@ai-sdk/mistral'
import { logger, schemaTask } from '@trigger.dev/sdk'
import { generateText, Output } from 'ai'
import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, notExists } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import {
  attachment,
  attachmentSuggestionDismissal,
  bankTransaction,
  createDb,
  type ParsedInvoice,
} from '#db'

const payloadSchema = z.object({
  workspaceId: z.uuid(),
})

export type MatchPendingAttachmentsPayload = z.infer<typeof payloadSchema>

// Suggest a match when deterministic confidence clears this bar.
const SUGGEST_THRESHOLD = 0.6
// Only auto-suggest deterministically (no LLM) when the best candidate beats the
// runner-up by this margin. Closer than that and we let the LLM disambiguate.
const DETERMINISTIC_MARGIN = 0.12
// Same-currency amount tolerance for treating a transaction as an amount match.
const AMOUNT_TOLERANCE = 0.12
// Cap how many candidates we ever hand to the LLM, to bound tokens.
const LLM_CANDIDATE_CAP = 8

const DAY_MS = 24 * 60 * 60 * 1000

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

type Candidate = {
  id: string
  bookedAt: Date
  amount: string
  currency: string
  merchantName: string | null
  description: string
}

type ScoredCandidate = Candidate & {
  score: number
  amountScore: number
  dateScore: number
  nameScore: number
  sameCurrency: boolean
}

export const matchPendingAttachmentsTask = schemaTask({
  id: 'match-pending-attachments',
  schema: payloadSchema,
  queue: { concurrencyLimit: 1 },
  run: async (payload) => {
    const db = createDb()
    const confirmedAttachment = alias(attachment, 'confirmed_attachment')

    const pendingAttachments = await db.query.attachment.findMany({
      where: (table, { and, eq, isNotNull }) =>
        and(
          eq(table.workspaceId, payload.workspaceId),
          eq(table.status, 'unmatched'),
          isNotNull(table.parsedInvoice),
        ),
    })

    // Transactions that already have a confirmed attachment shouldn't be
    // suggested again.
    const matchedRows = await db
      .selectDistinct({ transactionId: attachment.transactionId })
      .from(attachment)
      .where(
        and(eq(attachment.workspaceId, payload.workspaceId), isNotNull(attachment.transactionId)),
      )
    const matchedTransactionIds = new Set(
      matchedRows.map((row) => row.transactionId).filter((id): id is string => id != null),
    )
    const dismissedRows =
      pendingAttachments.length > 0
        ? await db
            .select({
              attachmentId: attachmentSuggestionDismissal.attachmentId,
              transactionId: attachmentSuggestionDismissal.transactionId,
            })
            .from(attachmentSuggestionDismissal)
            .where(
              and(
                eq(attachmentSuggestionDismissal.workspaceId, payload.workspaceId),
                inArray(
                  attachmentSuggestionDismissal.attachmentId,
                  pendingAttachments.map((item) => item.id),
                ),
              ),
            )
        : []
    const dismissedTransactionIds = new Map<string, Set<string>>()

    for (const row of dismissedRows) {
      const transactionIds = dismissedTransactionIds.get(row.attachmentId) ?? new Set<string>()
      transactionIds.add(row.transactionId)
      dismissedTransactionIds.set(row.attachmentId, transactionIds)
    }

    logger.info('Scanning unmatched attachments', {
      workspaceId: payload.workspaceId,
      count: pendingAttachments.length,
    })

    let matched = 0
    let llmCalls = 0

    for (const att of pendingAttachments) {
      const invoice = att.parsedInvoice
      if (!invoice) {
        continue
      }

      const invoiceAmount = parseAmount(invoice.amount)
      const invoiceCurrency = invoice.currency?.trim().toUpperCase() || null

      const anchorDate = pickAnchorDate(invoice, att.createdAt)
      const dueDate = invoice.dueDate ? safeDate(invoice.dueDate) : null
      const isFallbackDate = !invoice.invoiceDate && !invoice.dueDate

      // Wide forward window: invoices are paid days/weeks after they're issued
      // (net 15/30/60). The amount filter keeps precision, so the window can be
      // generous without inviting false positives. Fallback dates (email arrival)
      // get a tighter forward reach since they aren't a real issue date.
      const from = new Date(anchorDate.getTime() - 10 * DAY_MS)
      const to = new Date(anchorDate.getTime() + (isFallbackDate ? 30 : 75) * DAY_MS)

      const rawCandidates = await db
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
            // Invoices/receipts are money out — only consider expense (negative)
            // transactions so income can never be suggested for an invoice.
            lt(bankTransaction.amount, '0'),
          ),
        )

      const dismissedForAttachment = dismissedTransactionIds.get(att.id)
      const candidates = rawCandidates.filter(
        (candidate) =>
          !matchedTransactionIds.has(candidate.id) && !dismissedForAttachment?.has(candidate.id),
      )

      if (candidates.length === 0) {
        continue
      }

      const scored = candidates
        .map((candidate) =>
          scoreCandidate(candidate, {
            invoice,
            invoiceAmount,
            invoiceCurrency,
            anchorDate,
            dueDate,
          }),
        )
        .sort((a, b) => b.score - a.score)

      // Same-currency candidates whose amount is within tolerance: this is the
      // reliable, deterministic path.
      const amountMatches =
        invoiceAmount != null && invoiceCurrency != null
          ? scored.filter(
              (candidate) =>
                candidate.sameCurrency &&
                amountWithinTolerance(invoiceAmount, Math.abs(Number(candidate.amount))),
            )
          : []

      let chosen: { transactionId: string; via: string } | null = null

      const best = amountMatches[0]
      const second = amountMatches[1]

      if (best && best.score >= SUGGEST_THRESHOLD) {
        if (!second || best.score - second.score >= DETERMINISTIC_MARGIN) {
          // Clear deterministic winner — no LLM needed.
          chosen = { transactionId: best.id, via: 'deterministic' }
        } else {
          // Several close same-currency candidates — let the LLM break the tie.
          const pick = await pickWithLlm(invoice, amountMatches.slice(0, LLM_CANDIDATE_CAP))
          llmCalls++
          if (pick) {
            chosen = { transactionId: pick, via: 'llm-tiebreak' }
          }
        }
      } else {
        // No confident same-currency amount match. Could be cross-currency (a
        // foreign vendor charged in the account currency) or a noisy amount.
        // Fall back to the LLM over the best-ranked candidates.
        const fallback = scored.slice(0, LLM_CANDIDATE_CAP)
        const pick = await pickWithLlm(invoice, fallback)
        llmCalls++
        if (pick) {
          chosen = { transactionId: pick, via: 'llm-fallback' }
        }
      }

      if (!chosen) {
        continue
      }

      const [updated] = await db
        .update(attachment)
        .set({ suggestedTransactionId: chosen.transactionId, status: 'suggested' })
        .where(
          and(
            eq(attachment.id, att.id),
            eq(attachment.workspaceId, payload.workspaceId),
            eq(attachment.status, 'unmatched'),
            isNull(attachment.transactionId),
            isNull(attachment.suggestedTransactionId),
            notExists(
              db
                .select({ id: confirmedAttachment.id })
                .from(confirmedAttachment)
                .where(
                  and(
                    eq(confirmedAttachment.workspaceId, payload.workspaceId),
                    eq(confirmedAttachment.transactionId, chosen.transactionId),
                  ),
                ),
            ),
          ),
        )
        .returning({ id: attachment.id })

      if (!updated) {
        continue
      }

      matched++
      logger.info('Suggested match stored', {
        attachmentId: att.id,
        transactionId: chosen.transactionId,
        via: chosen.via,
      })
    }

    return { processed: pendingAttachments.length, matched, llmCalls }
  },
})

async function pickWithLlm(invoice: ParsedInvoice, candidates: ScoredCandidate[]) {
  if (candidates.length === 0) {
    return null
  }

  const compressed = candidates.map((candidate) => ({
    id: candidate.id,
    date: candidate.bookedAt.toISOString().split('T')[0],
    amount: candidate.amount,
    currency: candidate.currency,
    name: candidate.merchantName ?? candidate.description,
  }))

  const { output } = await generateText({
    model: mistral('mistral-small-latest'),
    output: Output.object({ schema: matchResultSchema }),
    prompt: `You are matching an invoice or receipt to a bank transaction.

Invoice metadata:
${JSON.stringify(invoice, null, 2)}

Candidate transactions (all are expenses, pre-filtered to a plausible date range):
${JSON.stringify(compressed, null, 2)}

Pick the transaction that best matches this invoice. Consider:
- Amount: a same-currency match should be very close. If the invoice currency differs from the transaction currency (a foreign purchase charged in the account currency), the amounts will differ — in that case rely on vendor name and date, not the raw numbers.
- Vendor/merchant name similarity.
- Date proximity (the payment is usually on or shortly after the invoice date).
- The invoice number, if it appears in the transaction text.

Do not match on date proximity alone. Return null for transactionId if no transaction is a plausible match, and only return high or medium confidence when you are reasonably sure.`,
  })

  if (!output || !output.transactionId || output.confidence === 'low') {
    return null
  }

  // Guard against hallucinated IDs.
  const exists = candidates.some((candidate) => candidate.id === output.transactionId)
  if (!exists) {
    logger.warn('LLM returned transaction ID not in candidate list', {
      transactionId: output.transactionId,
    })
    return null
  }

  return output.transactionId
}

function scoreCandidate(
  candidate: Candidate,
  context: {
    invoice: ParsedInvoice
    invoiceAmount: number | null
    invoiceCurrency: string | null
    anchorDate: Date
    dueDate: Date | null
  },
): ScoredCandidate {
  const sameCurrency =
    context.invoiceCurrency != null &&
    candidate.currency.trim().toUpperCase() === context.invoiceCurrency

  const amount =
    context.invoiceAmount != null && sameCurrency
      ? amountScore(context.invoiceAmount, Math.abs(Number(candidate.amount)))
      : 0

  const date = dateScore(context.anchorDate, context.dueDate, candidate.bookedAt)
  const name = nameScore(
    context.invoice.vendorName,
    context.invoice.invoiceNumber,
    `${candidate.merchantName ?? ''} ${candidate.description}`,
  )

  let score: number
  if (context.invoiceAmount != null && sameCurrency) {
    score = amount * 0.5 + date * 0.3 + name * 0.2

    // A perfect amount with a plausible date is almost certainly the match.
    if (amount >= 0.98 && date >= 0.7) {
      score = Math.max(score, 0.9)
    }
    // The invoice number appearing in the transaction text is a strong signal.
    if (name >= 0.95) {
      score = Math.max(score, 0.85)
    }
    // Penalise a pure amount+date coincidence with no name overlap at all.
    if (name === 0) {
      score *= 0.75
    }
  } else {
    // Cross-currency / unknown amount: amount is unreliable, so rank by
    // name + date only. This score is just for ranking what we send to the LLM.
    score = name * 0.6 + date * 0.4
  }

  return {
    ...candidate,
    score,
    amountScore: amount,
    dateScore: date,
    nameScore: name,
    sameCurrency,
  }
}

function amountWithinTolerance(invoiceAmount: number, transactionAmount: number) {
  if (invoiceAmount <= 0) {
    return false
  }
  return Math.abs(transactionAmount - invoiceAmount) / invoiceAmount <= AMOUNT_TOLERANCE
}

function amountScore(invoiceAmount: number, transactionAmount: number) {
  if (invoiceAmount <= 0) {
    return 0
  }

  const ratio = Math.abs(transactionAmount - invoiceAmount) / invoiceAmount

  if (ratio === 0) {
    return 1
  }
  if (ratio <= 0.01) {
    return 0.98
  }
  if (ratio <= 0.03) {
    return 0.92
  }
  if (ratio <= 0.06) {
    return 0.8
  }
  if (ratio <= AMOUNT_TOLERANCE) {
    return 0.55
  }
  return 0
}

function dateScore(anchorDate: Date, dueDate: Date | null, transactionDate: Date) {
  const daysFromAnchor = Math.round((transactionDate.getTime() - anchorDate.getTime()) / DAY_MS)

  let score: number
  if (daysFromAnchor >= -3 && daysFromAnchor <= 3) {
    score = 1
  } else if (daysFromAnchor > 3 && daysFromAnchor <= 14) {
    score = 0.9
  } else if (daysFromAnchor > 14 && daysFromAnchor <= 35) {
    score = 0.8
  } else if (daysFromAnchor > 35 && daysFromAnchor <= 60) {
    score = 0.65
  } else if (daysFromAnchor > 60 && daysFromAnchor <= 75) {
    score = 0.5
  } else if (daysFromAnchor >= -10 && daysFromAnchor < -3) {
    score = 0.5
  } else {
    score = 0.2
  }

  // Payment landing on/near the due date is a strong signal.
  if (dueDate) {
    const daysFromDue = Math.abs(
      Math.round((transactionDate.getTime() - dueDate.getTime()) / DAY_MS),
    )
    if (daysFromDue <= 3) {
      score = Math.max(score, 0.95)
    } else if (daysFromDue <= 7) {
      score = Math.max(score, 0.85)
    }
  }

  return score
}

function nameScore(
  vendorName: string | null,
  invoiceNumber: string | null,
  transactionText: string,
) {
  // Invoice number appearing verbatim in the transaction text is the strongest
  // signal we have short of an exact amount.
  if (invoiceNumber) {
    const needle = invoiceNumber.toLowerCase().replace(/[^a-z0-9]/g, '')
    const haystack = transactionText.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (needle.length >= 4 && haystack.includes(needle)) {
      return 0.97
    }
  }

  const vendorTokens = tokenize(vendorName)
  const textTokens = tokenize(transactionText)

  if (vendorTokens.size === 0 || textTokens.size === 0) {
    return 0
  }

  let intersection = 0
  for (const token of vendorTokens) {
    if (textTokens.has(token)) {
      intersection++
    }
  }

  const union = new Set([...vendorTokens, ...textTokens]).size
  const jaccard = intersection / union
  const containment = intersection / vendorTokens.size

  return Math.max(jaccard, containment * 0.9)
}

function tokenize(value: string | null) {
  return new Set(
    (value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 3),
  )
}

function pickAnchorDate(invoice: ParsedInvoice, createdAt: Date) {
  const invoiceDate = invoice.invoiceDate ? safeDate(invoice.invoiceDate) : null
  if (invoiceDate) {
    return invoiceDate
  }

  const dueDate = invoice.dueDate ? safeDate(invoice.dueDate) : null
  if (dueDate) {
    return dueDate
  }

  return createdAt
}

function safeDate(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function parseAmount(value: string | null) {
  if (!value) {
    return null
  }

  const parsed = Number(value.replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.abs(parsed)
}
