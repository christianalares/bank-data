import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createPersonalSearchToken,
  decryptPersonalAccountPayload,
  decryptPersonalTransactionPayload,
  encryptPersonalAccountPayload,
  encryptPersonalTransactionPayload,
  getPersonalAccountDisplayName,
  tokenizePersonalSearchText,
} from './personal-data'

const originalKey = process.env.PERSONAL_DATA_ENCRYPTION_KEY

beforeEach(() => {
  process.env.PERSONAL_DATA_ENCRYPTION_KEY = 'ab'.repeat(32)
})

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.PERSONAL_DATA_ENCRYPTION_KEY
  } else {
    process.env.PERSONAL_DATA_ENCRYPTION_KEY = originalKey
  }
})

describe('personal data protection', () => {
  it('round-trips account and transaction payloads without plaintext in the envelope', () => {
    const transaction = {
      description: 'NETFLIX.COM',
      merchantName: 'Netflix',
      counterpartyName: null,
      note: 'Family plan',
      rawMetadata: { provider: 'private' },
    }
    const account = {
      name: 'Everyday account',
      iban: 'SE123456789',
      accountType: 'CACC',
      rawMetadata: { private: true },
    }
    const encryptedTransaction = encryptPersonalTransactionPayload(transaction)
    const encryptedAccount = encryptPersonalAccountPayload(account)

    expect(encryptedTransaction).not.toContain('Netflix')
    expect(encryptedAccount).not.toContain('SE123456789')
    expect(decryptPersonalTransactionPayload(encryptedTransaction)).toEqual(transaction)
    expect(decryptPersonalAccountPayload(encryptedAccount)).toEqual(account)
  })

  it('uses an encrypted account alias when one is present', () => {
    const account = {
      name: 'Bank-provided account',
      nameOverride: 'Daily spending',
      iban: 'SE123456789',
      accountType: 'CACC',
      rawMetadata: { private: true },
    }

    expect(getPersonalAccountDisplayName(account)).toBe('Daily spending')
    expect(getPersonalAccountDisplayName({ ...account, nameOverride: '  ' })).toBe(
      'Bank-provided account',
    )
  })

  it('creates deterministic blind search tokens from normalized words', () => {
    expect(tokenizePersonalSearchText('  HBO, Netflix och HBO  ')).toEqual([
      'hbo',
      'netflix',
      'och',
    ])
    expect(createPersonalSearchToken('NETFLIX')).toBe(createPersonalSearchToken('netflix'))
    expect(createPersonalSearchToken('netflix')).not.toContain('netflix')
  })
})
