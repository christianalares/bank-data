import { z } from 'zod'

const nullableText = z.string().nullable()
const identification = z.object({
  identification: nullableText,
  schemeName: nullableText,
  issuer: nullableText,
})

export const listBusinessUpcomingPaymentsInputSchema = z
  .object({
    accountId: z
      .string()
      .uuid()
      .describe('A selected canonical business account ID; discover accounts first.'),
    dateFrom: z.string().date(),
    dateTo: z.string().date(),
  })
  .refine(
    ({ dateFrom, dateTo }) =>
      dateFrom <= dateTo && Date.parse(dateTo) - Date.parse(dateFrom) <= 92 * 86_400_000,
    {
      message: 'Use an inclusive date range of at most 93 days, with dateFrom on or before dateTo',
    },
  )

export const businessUpcomingPaymentsSchema = z.object({
  entries: z.array(
    z.object({
      accountId: z.string().uuid(),
      accountName: z.string(),
      bankName: z.string(),
      amount: nullableText,
      currency: nullableText,
      creditDebitIndicator: z.enum(['DBIT', 'CRDT']).nullable(),
      creditorName: nullableText,
      creditorAccount: z
        .object({ iban: nullableText, other: identification.nullable() })
        .nullable(),
      creditorAccountAdditionalIdentification: identification.nullable(),
      referenceNumber: nullableText,
      referenceNumberSchema: nullableText,
      remittanceInformation: z.array(z.string()).nullable(),
      providerStatus: z.enum(['PDNG', 'SCHD']),
      valueDate: nullableText,
      bookingDate: nullableText,
      transactionDate: nullableText,
      dateRangeMatch: z.enum(['value_date', 'unknown']),
      providerTransactionId: nullableText,
      entryReference: nullableText,
      note: nullableText,
      merchantCategoryCode: nullableText,
      bankTransactionCode: z
        .object({ code: nullableText, subCode: nullableText, description: nullableText })
        .nullable(),
      signingStatus: z.literal('not_provided'),
      retrievedAt: z.string().datetime(),
    }),
  ),
  dateFilter: z.object({
    field: z.literal('value_date'),
    dateFrom: z.string().date(),
    dateTo: z.string().date(),
    undatedEntries: z.literal('included_with_unknown_match'),
  }),
  excludedStatusCounts: z.array(
    z.object({ providerStatus: nullableText, count: z.number().int().nonnegative() }),
  ),
  excludedByValueDateCount: z.number().int().nonnegative(),
  retrieval: z.object({
    startedAt: z.string().datetime(),
    retrievedAt: z.string().datetime().nullable(),
    pagesRetrieved: z.number().int().nonnegative(),
    complete: z.boolean(),
    incompleteReason: z
      .enum([
        'provider_error',
        'invalid_response',
        'repeated_cursor',
        'page_limit',
        'entry_limit',
        'time_limit',
      ])
      .nullable(),
  }),
  instructionCoverage: z.literal('not_guaranteed'),
})

export type ListBusinessUpcomingPaymentsInput = z.input<
  typeof listBusinessUpcomingPaymentsInputSchema
>
