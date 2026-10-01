import { z } from 'zod'

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date in YYYY-MM-DD format')

export const searchPersonalTransactionsInputSchema = z
  .object({
    query: z.string().trim().min(1).max(300).optional(),
    dateFrom: isoDateSchema.optional(),
    dateTo: isoDateSchema.optional(),
    amountMin: z.number().finite().optional(),
    amountMax: z.number().finite().optional(),
    currency: z.string().trim().length(3).toUpperCase().optional(),
    accountId: z.string().uuid().optional(),
    direction: z.enum(['credit', 'debit']).optional(),
    includeInternalTransfers: z.boolean().default(true),
    cursor: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(200).default(50),
  })
  .refine(
    ({ dateFrom, dateTo }) => !dateFrom || !dateTo || dateFrom <= dateTo,
    'dateFrom must be on or before dateTo',
  )
  .refine(
    ({ amountMin, amountMax }) =>
      amountMin === undefined || amountMax === undefined || amountMin <= amountMax,
    'amountMin must be less than or equal to amountMax',
  )

export const personalAccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  currency: z.string(),
  currentBalance: z.string().nullable(),
  availableBalance: z.string().nullable(),
  updatedAt: z.string().datetime(),
})

export const personalAccountsSchema = z.object({
  accounts: z.array(personalAccountSchema),
})

export const personalTransactionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  accountName: z.string(),
  bookedAt: z.string().datetime(),
  amount: z.string(),
  currency: z.string(),
  description: z.string(),
  merchantName: z.string().nullable(),
  counterpartyName: z.string().nullable(),
  note: z.string().nullable(),
  status: z.enum(['booked', 'pending']),
  transferState: z.enum(['ordinary', 'suggested', 'confirmed', 'dismissed']),
  transferPairId: z.string().uuid().nullable(),
})

export const personalTransactionPageSchema = z.object({
  transactions: z.array(personalTransactionSchema),
  nextCursor: z.string().nullable(),
})

export const personalSpendingSummaryInputSchema = z
  .object({
    query: z.string().trim().min(1).max(300).optional(),
    dateFrom: isoDateSchema.optional(),
    dateTo: isoDateSchema.optional(),
    accountId: z.string().uuid().optional(),
    currency: z.string().trim().length(3).toUpperCase().optional(),
    includeInternalTransfers: z.boolean().default(false),
  })
  .refine(
    ({ dateFrom, dateTo }) => !dateFrom || !dateTo || dateFrom <= dateTo,
    'dateFrom must be on or before dateTo',
  )

export const personalSpendingSummarySchema = z.object({
  totals: z.array(
    z.object({
      currency: z.string(),
      grossSpent: z.string(),
      refunds: z.string(),
      netSpent: z.string(),
      transactionCount: z.number().int().nonnegative(),
    }),
  ),
})

export type SearchPersonalTransactionsInput = z.infer<typeof searchPersonalTransactionsInputSchema>
export type PersonalSpendingSummaryInput = z.infer<typeof personalSpendingSummaryInputSchema>
