import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type Database, encryptPersonalAccountPayload } from '#db'
import { loadSelectedBankAccounts } from './bank-accounts'

let previousKey: string | undefined

beforeEach(() => {
  previousKey = process.env.PERSONAL_DATA_ENCRYPTION_KEY
  process.env.PERSONAL_DATA_ENCRYPTION_KEY = '0'.repeat(64)
})

function account(id: string, createdAt: string, name: string, override: string | null) {
  return {
    id,
    name,
    currency: 'SEK',
    currentBalance: name === 'renewed' ? '200.00' : '100.00',
    availableBalance: null,
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
    encryptedPersonalPayload: encryptPersonalAccountPayload({
      name,
      nameOverride: override,
      iban: 'SE1234567890',
      accountType: null,
      rawMetadata: null,
    }),
  }
}

function mockDb(rows: unknown[]): Database {
  const query = { where: async () => rows }
  return {
    select: () => ({ from: () => ({ leftJoin: () => query }) }),
  } as unknown as Database
}

describe('selected bank account identity', () => {
  it('keeps the oldest public ID while using the active balance and old name override', async () => {
    const oldId = '00000000-0000-4000-8000-000000000001'
    const newId = '00000000-0000-4000-8000-000000000002'
    const rows = [
      {
        account: account(newId, '2026-10-02T00:00:00.000Z', 'renewed', null),
        connection: {
          name: 'Enable Banking Nordea',
          rawMetadata: { aspsp: { name: 'Nordea' } },
          status: 'connected',
          lastSyncedAt: new Date('2026-10-02T01:00:00.000Z'),
        },
      },
      {
        account: account(oldId, '2025-01-01T00:00:00.000Z', 'original', 'My account'),
        connection: {
          name: 'Enable Banking Nordea',
          rawMetadata: { aspsp: { name: 'Nordea' } },
          status: 'disconnected',
          lastSyncedAt: new Date('2026-09-30T01:00:00.000Z'),
        },
      },
    ]

    const result = await loadSelectedBankAccounts(mockDb(rows), oldId, 'personal')

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: oldId,
      sourceIds: [newId, oldId],
      bankName: 'Nordea',
      name: 'My account',
      currentBalance: '200.00',
      connectionStatus: 'connected',
      lastSyncedAt: '2026-10-02T01:00:00.000Z',
    })
  })

  it('keeps company rows separate even when their names match', async () => {
    const rows = [
      {
        account: account(
          '00000000-0000-4000-8000-000000000001',
          '2025-01-01T00:00:00.000Z',
          'same',
          null,
        ),
        connection: {
          name: 'Enable Banking SEB',
          rawMetadata: null,
          status: 'connected',
          lastSyncedAt: null,
        },
      },
      {
        account: account(
          '00000000-0000-4000-8000-000000000002',
          '2026-01-01T00:00:00.000Z',
          'same',
          null,
        ),
        connection: {
          name: 'Enable Banking SEB',
          rawMetadata: null,
          status: 'connected',
          lastSyncedAt: null,
        },
      },
    ]

    expect(await loadSelectedBankAccounts(mockDb(rows), 'workspace', 'business')).toHaveLength(2)
  })

  it('groups a renewed company account with its historical IBAN and keeps both source IDs', async () => {
    const oldId = '00000000-0000-4000-8000-000000000003'
    const newId = '00000000-0000-4000-8000-000000000004'
    const rows = [
      {
        account: {
          ...account(newId, '2026-10-01T00:00:00.000Z', 'Hidden Village AB', null),
          iban: 'SE12 3456 7890',
          currentBalance: '200.00',
        },
        connection: {
          name: 'Enable Banking SEB',
          rawMetadata: null,
          status: 'error',
          lastSyncedAt: new Date('2026-10-02T01:00:00.000Z'),
        },
      },
      {
        account: {
          ...account(oldId, '2025-01-01T00:00:00.000Z', 'Hidden Village AB', null),
          iban: 'se1234567890',
          currentBalance: '100.00',
        },
        connection: {
          name: 'Enable Banking SEB',
          rawMetadata: null,
          status: 'disconnected',
          lastSyncedAt: new Date('2026-08-08T01:00:00.000Z'),
        },
      },
    ]

    const result = await loadSelectedBankAccounts(mockDb(rows), 'workspace', 'business')

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: oldId,
      sourceIds: [newId, oldId],
      bankName: 'SEB',
      currentBalance: '200.00',
      connectionStatus: 'error',
      lastSyncedAt: '2026-10-02T01:00:00.000Z',
    })
  })

  it('keeps detached historical account IDs available through a renewed connection', async () => {
    const oldId = '00000000-0000-4000-8000-000000000005'
    const newId = '00000000-0000-4000-8000-000000000006'
    const rows = [
      {
        account: {
          ...account(oldId, '2025-01-01T00:00:00.000Z', 'old', null),
          iban: 'SE12 3456 7890',
        },
        connection: null,
      },
      {
        account: {
          ...account(newId, '2026-10-01T00:00:00.000Z', 'renewed', null),
          iban: 'se1234567890',
        },
        connection: {
          name: 'Enable Banking SEB',
          rawMetadata: null,
          status: 'connected',
          lastSyncedAt: new Date('2026-10-03T02:00:00.000Z'),
        },
      },
    ]

    const result = await loadSelectedBankAccounts(mockDb(rows), 'workspace', 'business')

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: oldId,
      sourceIds: [newId, oldId],
      bankName: 'SEB',
      connectionStatus: 'connected',
    })
  })
})

afterEach(() => {
  if (previousKey === undefined) {
    delete process.env.PERSONAL_DATA_ENCRYPTION_KEY
  } else {
    process.env.PERSONAL_DATA_ENCRYPTION_KEY = previousKey
  }
})
