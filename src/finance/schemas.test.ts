import { describe, expect, it } from 'vitest'

import { searchTransactionsInputSchema } from './schemas'

describe('transaction search input', () => {
  it('accepts real ISO calendar dates', () => {
    const result = searchTransactionsInputSchema.parse({
      dateFrom: '2026-02-28',
      dateTo: '2026-03-01',
    })

    expect(result.dateFrom).toBe('2026-02-28')
  })

  it('rejects normalized but nonexistent calendar dates', () => {
    expect(() =>
      searchTransactionsInputSchema.parse({
        dateFrom: '2026-02-31',
      }),
    ).toThrow('Expected a real calendar date')
  })
})
