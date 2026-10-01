import { describe, expect, it } from 'vitest'

import {
  personalSpendingSummaryInputSchema,
  searchPersonalTransactionsInputSchema,
} from './personal-schemas'

describe('personal finance inputs', () => {
  it('keeps transfers in transaction history by default', () => {
    const input = searchPersonalTransactionsInputSchema.parse({ limit: 10 })

    expect(input.includeInternalTransfers).toBe(true)
    expect(input.limit).toBe(10)
  })

  it('excludes transfers from spending summaries by default', () => {
    const input = personalSpendingSummaryInputSchema.parse({
      query: 'video streaming',
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    })

    expect(input.includeInternalTransfers).toBe(false)
  })

  it('rejects an inverted date range', () => {
    expect(() =>
      searchPersonalTransactionsInputSchema.parse({
        dateFrom: '2026-07-01',
        dateTo: '2026-06-01',
      }),
    ).toThrow('dateFrom must be on or before dateTo')
  })
})
