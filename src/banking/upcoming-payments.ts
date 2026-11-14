import { z } from 'zod'
import { enableBankingRequest } from './index'

const text = z.string().nullish()
const sourceDate = z.string().date().nullish()
const identification = z.object({ identification: text, scheme_name: text, issuer: text })

// A separate source contract: these entries never enter booked normalization.
export const preliminaryTransactionSchema = z.object({
  status: text,
  transaction_id: text,
  entry_reference: text,
  transaction_amount: z
    .object({
      amount: z
        .string()
        .regex(/^-?\d+(\.\d+)?$/)
        .nullish(),
      currency: text,
    })
    .nullish(),
  credit_debit_indicator: z.enum(['DBIT', 'CRDT']).nullish(),
  creditor: z.object({ name: text }).nullish(),
  creditor_account: z.object({ iban: text, other: identification.nullish() }).nullish(),
  creditor_account_additional_identification: identification.nullish(),
  reference_number: text,
  reference_number_schema: text,
  remittance_information: z.array(z.string()).nullish(),
  booking_date: sourceDate,
  transaction_date: sourceDate,
  value_date: sourceDate,
  note: text,
  merchant_category_code: text,
  bank_transaction_code: z.object({ code: text, sub_code: text, description: text }).nullish(),
})

const pageSchema = z.object({
  transactions: z.array(preliminaryTransactionSchema),
  continuation_key: z.string().min(1).nullish(),
})

export class UpcomingPaymentsReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UpcomingPaymentsReadError'
  }
}

export const UPCOMING_PAYMENT_LIMITS = { pages: 20, entries: 2000, timeoutMs: 20_000 } as const

export type IncompleteReason =
  | 'provider_error'
  | 'invalid_response'
  | 'repeated_cursor'
  | 'page_limit'
  | 'entry_limit'
  | 'time_limit'

/** No retries or cache: background bank reads may be rate limited. */
export async function getEnableBankingPreliminaryTransactions(
  accountId: string,
  options: { dateFrom: string; dateTo: string; authorize: () => Promise<void> },
) {
  const startedAt = new Date().toISOString()
  const deadline = Date.now() + UPCOMING_PAYMENT_LIMITS.timeoutMs
  const entries: Array<{
    transaction: z.infer<typeof preliminaryTransactionSchema>
    retrievedAt: string
  }> = []
  const seen = new Set<string>()
  let continuationKey: string | undefined
  let pagesRetrieved = 0
  let retrievedAt: string | null = null
  let incompleteReason: IncompleteReason | null = null

  do {
    // Fail closed on revocation or a changed provider connection, including continuation reads.
    await options.authorize()
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      incompleteReason = 'time_limit'
      break
    }
    const params = new URLSearchParams({
      date_from: options.dateFrom,
      date_to: options.dateTo,
      strategy: 'default',
    })
    if (continuationKey) params.set('continuation_key', continuationKey)

    let raw: unknown
    try {
      // Deliberately omit transaction_status. SEB Sweden rejects the SCHD filter.
      raw = await enableBankingRequest(
        `/accounts/${encodeURIComponent(accountId)}/transactions?${params.toString()}`,
        { timeoutMs: remaining },
      )
    } catch {
      incompleteReason = 'provider_error'
      break
    }
    const page = pageSchema.safeParse(raw)
    if (!page.success) {
      incompleteReason = 'invalid_response'
      break
    }
    pagesRetrieved += 1
    retrievedAt = new Date().toISOString()
    const capacity = UPCOMING_PAYMENT_LIMITS.entries - entries.length
    entries.push(
      ...page.data.transactions.slice(0, capacity).map((transaction) => ({
        transaction,
        retrievedAt: retrievedAt as string,
      })),
    )
    continuationKey = page.data.continuation_key ?? undefined
    if (
      page.data.transactions.length > capacity ||
      (continuationKey && entries.length >= UPCOMING_PAYMENT_LIMITS.entries)
    ) {
      incompleteReason = 'entry_limit'
    } else if (continuationKey && seen.has(continuationKey)) {
      incompleteReason = 'repeated_cursor'
    } else if (continuationKey && pagesRetrieved >= UPCOMING_PAYMENT_LIMITS.pages) {
      incompleteReason = 'page_limit'
    }
    if (incompleteReason) break
    if (continuationKey) seen.add(continuationKey)
  } while (continuationKey)

  await options.authorize()
  if (pagesRetrieved === 0) {
    throw new UpcomingPaymentsReadError(
      'Upcoming bank entries could not be retrieved. No complete result is available; check the connection or retry later.',
    )
  }
  return {
    entries,
    retrieval: {
      startedAt,
      retrievedAt,
      pagesRetrieved,
      complete: incompleteReason === null,
      incompleteReason,
    },
  }
}
