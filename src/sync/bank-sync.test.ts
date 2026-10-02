import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { NormalizedEnableBankingTransaction } from '#banking'
import { type bankTransaction, encryptPersonalTransactionPayload } from '#db'

import { matchesHistoricalTransaction, retryProvider, shouldDeferBackgroundSync } from './bank-sync'

const bookedAt = new Date('2026-09-28T00:00:00.000Z')
type BankTransaction = typeof bankTransaction.$inferSelect

function incoming(reference?: string): NormalizedEnableBankingTransaction {
  return {
    providerTransactionId: reference ?? 'new-uid-fallback-hash',
    status: 'booked',
    bookedAt,
    valueAt: null,
    amount: '-42.00',
    currency: 'SEK',
    description: 'Purchase',
    merchantName: null,
    counterpartyName: null,
    balanceAfterTransaction: '100.00',
    rawMetadata: reference ? { entry_reference: reference } : {},
  }
}

function historical(reference?: string): BankTransaction {
  return {
    providerTransactionId: reference ?? 'old-uid-fallback-hash',
    bookedAt,
    amount: '-42.00',
    currency: 'SEK',
    balanceAfterTransaction: '100.00',
    encryptedPersonalPayload: encryptPersonalTransactionPayload({
      description: 'Purchase',
      merchantName: null,
      counterpartyName: null,
      note: null,
      rawMetadata: reference ? { entry_reference: reference } : {},
    }),
  } as BankTransaction
}

describe('bank sync overlap across renewed consents', () => {
  beforeEach(() => {
    process.env.PERSONAL_DATA_ENCRYPTION_KEY = '11'.repeat(32)
  })

  afterEach(() => {
    delete process.env.PERSONAL_DATA_ENCRYPTION_KEY
  })

  it('keeps a historical row when the provider reference is stable across account UIDs', () => {
    expect(
      matchesHistoricalTransaction(incoming('same-reference'), [historical('same-reference')]),
    ).toBe(true)
    expect(
      matchesHistoricalTransaction(incoming('same-reference'), [
        { ...historical('same-reference'), bookedAt: new Date('2026-09-27T00:00:00.000Z') },
      ]),
    ).toBe(true)
  })

  it('matches a unique fallback transaction when the account UID changed', () => {
    expect(matchesHistoricalTransaction(incoming(), [historical()])).toBe(true)
  })

  it('imports a new booked transaction with no historical overlap', () => {
    expect(
      matchesHistoricalTransaction(incoming('new-reference'), [
        { ...historical('old-reference'), amount: '-40.00' },
      ]),
    ).toBe(false)
  })

  it('stops on ambiguous fingerprints or conflicting provider references', () => {
    expect(() => matchesHistoricalTransaction(incoming(), [historical(), historical()])).toThrow(
      'Ambiguous transaction overlap',
    )
    expect(() =>
      matchesHistoricalTransaction(incoming('new-reference'), [historical('old-reference')]),
    ).toThrow('Ambiguous transaction overlap')
    expect(() =>
      matchesHistoricalTransaction({ ...incoming(), balanceAfterTransaction: null }, [
        { ...historical(), balanceAfterTransaction: null },
      ]),
    ).toThrow('Ambiguous transaction overlap')
    expect(() =>
      matchesHistoricalTransaction(incoming('same-reference'), [
        { ...historical('same-reference'), amount: '-41.00' },
      ]),
    ).toThrow('changed amount')
    expect(() =>
      matchesHistoricalTransaction(incoming('same-reference'), [
        { ...historical('same-reference'), bookedAt: new Date('2026-09-25T00:00:00.000Z') },
      ]),
    ).toThrow('moved more than one booking day')
  })
})

describe('bank background-fetch limits', () => {
  const lastFetchAt = new Date('2026-10-02T02:04:11.000Z')
  const soonAfter = new Date('2026-10-02T02:10:00.000Z')
  const nextDay = new Date('2026-10-03T02:00:00.000Z')

  it('defers recently synced and rate-limited connections until the bank window has passed', () => {
    const connected = {
      status: 'connected' as const,
      errorMessage: null,
      lastSyncedAt: lastFetchAt,
      updatedAt: lastFetchAt,
    }
    const rateLimited = {
      ...connected,
      status: 'error' as const,
      errorMessage: 'Enable Banking request failed (429): ASPSP_RATE_LIMIT_EXCEEDED',
    }

    expect(shouldDeferBackgroundSync(connected, soonAfter)).toBe(true)
    expect(shouldDeferBackgroundSync(rateLimited, soonAfter)).toBe(true)
    expect(
      shouldDeferBackgroundSync(
        rateLimited,
        new Date(lastFetchAt.getTime() + 6 * 60 * 60 * 1000 - 1),
      ),
    ).toBe(true)
    expect(
      shouldDeferBackgroundSync(rateLimited, new Date(lastFetchAt.getTime() + 6 * 60 * 60 * 1000)),
    ).toBe(false)
    expect(shouldDeferBackgroundSync(connected, nextDay)).toBe(false)
    expect(shouldDeferBackgroundSync(rateLimited, nextDay)).toBe(false)
    expect(
      shouldDeferBackgroundSync(
        { ...rateLimited, errorMessage: 'Enable Banking request failed (429): Too many requests' },
        soonAfter,
      ),
    ).toBe(true)
    expect(
      shouldDeferBackgroundSync(
        { ...rateLimited, errorMessage: 'Enable Banking request failed (500)' },
        soonAfter,
      ),
    ).toBe(false)
  })

  it.each([
    'Enable Banking request failed (429): ASPSP_RATE_LIMIT_EXCEEDED',
    'Enable Banking request failed (429): Too many requests',
  ])('does not immediately retry a bank-side rate limit: %s', async (message) => {
    let calls = 0
    await expect(
      retryProvider(async () => {
        calls += 1
        throw new Error(message)
      }),
    ).rejects.toThrow(message)
    expect(calls).toBe(1)
  })
})
