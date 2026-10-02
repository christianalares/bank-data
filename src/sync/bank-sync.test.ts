import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { NormalizedEnableBankingTransaction } from '#banking'
import { type bankTransaction, encryptPersonalTransactionPayload } from '#db'

import { matchesHistoricalTransaction } from './bank-sync'

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
