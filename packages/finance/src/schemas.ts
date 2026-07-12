import { z } from 'zod'

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date in YYYY-MM-DD format')
  .refine(isValidIsoDate, 'Expected a real calendar date')

function isValidIsoDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`)

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const attachmentStateSchema = z.enum(['any', 'missing', 'suggested', 'matched'])
export const attachmentWorkflowStateSchema = z.enum([
  'unmatched',
  'suggested',
  'matched',
  'ignored',
])

export const searchTransactionsInputSchema = z
  .object({
    query: z.string().trim().min(1).max(200).optional(),
    dateFrom: isoDateSchema.optional(),
    dateTo: isoDateSchema.optional(),
    amountMin: z.number().finite().optional(),
    amountMax: z.number().finite().optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase())
      .optional(),
    accountId: z.string().uuid().optional(),
    transactionStatus: z.enum(['booked', 'pending']).optional(),
    attachmentState: attachmentStateSchema.default('any'),
    cursor: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(100).default(50),
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

export const listAttachmentsInputSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  state: attachmentWorkflowStateSchema.or(z.literal('any')).default('any'),
  source: z.enum(['manual', 'email']).optional(),
  transactionId: z.string().uuid().optional(),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(50),
})

export const getTransactionInputSchema = z.object({
  transactionId: z.string().uuid(),
})

export const transactionSummarySchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  accountName: z.string(),
  bookedAt: z.string().datetime(),
  amount: z.string(),
  currency: z.string(),
  description: z.string(),
  merchantName: z.string().nullable(),
  counterpartyName: z.string().nullable(),
  status: z.enum(['booked', 'pending']),
  note: z.string().nullable(),
  attachmentCount: z.number().int().nonnegative(),
  suggestedAttachmentCount: z.number().int().nonnegative(),
  attachmentState: z.enum(['missing', 'suggested', 'matched']),
})

export const transactionPageSchema = z.object({
  transactions: z.array(transactionSummarySchema),
  nextCursor: z.string().nullable(),
})

export const attachmentSummarySchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  source: z.enum(['manual', 'email']),
  state: attachmentWorkflowStateSchema,
  createdAt: z.string().datetime(),
  parsedInvoice: z
    .object({
      vendorName: z.string().nullable(),
      amount: z.string().nullable(),
      currency: z.string().nullable(),
      invoiceDate: z.string().nullable(),
      dueDate: z.string().nullable(),
      invoiceNumber: z.string().nullable(),
      lineItems: z
        .array(
          z.object({
            description: z.string(),
            amount: z.string(),
          }),
        )
        .optional(),
    })
    .nullable(),
  transaction: transactionSummarySchema
    .pick({
      id: true,
      bookedAt: true,
      amount: true,
      currency: true,
      description: true,
      merchantName: true,
    })
    .nullable(),
  suggestedTransaction: transactionSummarySchema
    .pick({
      id: true,
      bookedAt: true,
      amount: true,
      currency: true,
      description: true,
      merchantName: true,
    })
    .nullable(),
})

export const attachmentPageSchema = z.object({
  attachments: z.array(attachmentSummarySchema),
  nextCursor: z.string().nullable(),
})

export const transactionDetailSchema = transactionSummarySchema.extend({
  attachments: z.array(attachmentSummarySchema),
  attachmentsNextCursor: z.string().nullable(),
})

export const financeOverviewSchema = z.object({
  transactions: z.object({
    total: z.number().int().nonnegative(),
    missing: z.number().int().nonnegative(),
    suggested: z.number().int().nonnegative(),
    matched: z.number().int().nonnegative(),
  }),
  attachments: z.object({
    total: z.number().int().nonnegative(),
    unmatched: z.number().int().nonnegative(),
    suggested: z.number().int().nonnegative(),
    matched: z.number().int().nonnegative(),
    ignored: z.number().int().nonnegative(),
  }),
})

export type SearchTransactionsInput = z.infer<typeof searchTransactionsInputSchema>
export type ListAttachmentsInput = z.infer<typeof listAttachmentsInputSchema>
export type TransactionSummary = z.infer<typeof transactionSummarySchema>
export type AttachmentSummary = z.infer<typeof attachmentSummarySchema>
