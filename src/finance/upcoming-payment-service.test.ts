import { PgDialect } from 'drizzle-orm/pg-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import type { Database } from '#db'
import {
  getEnableBankingPreliminaryTransactions,
  type preliminaryTransactionSchema,
} from '../banking/upcoming-payments'
import {
  businessUpcomingPaymentsSchema,
  listBusinessUpcomingPaymentsInputSchema,
} from './upcoming-payment-schemas'
import { BusinessUpcomingPaymentService } from './upcoming-payment-service'

vi.mock('../banking/upcoming-payments', async (original) => ({
  ...(await original<typeof import('../banking/upcoming-payments')>()),
  getEnableBankingPreliminaryTransactions: vi.fn(),
}))

afterEach(() => vi.resetAllMocks())
const workspaceId = '00000000-0000-4000-8000-000000000001'
const oldId = '00000000-0000-4000-8000-000000000002'
const newId = '00000000-0000-4000-8000-000000000003'
const input = { accountId: oldId, dateFrom: '2026-01-01', dateTo: '2026-02-01' }
const retrievedAt = '2026-01-01T12:00:00.000Z'

function mockDb(
  options: { selected?: boolean; connected?: boolean; expired?: boolean; owner?: boolean } = {},
) {
  const statements: Array<{ sql: string; params: unknown[] }> = []
  const sources = [
    {
      id: newId,
      providerAccountId: 'current-provider-account',
      connectionId: 'current-connection',
      consentValidUntil: options.expired ? new Date('2020-01-01') : null,
    },
  ]
  const rows = [
    {
      account: {
        id: oldId,
        name: 'Synthetic account',
        iban: 'SYNTHETIC',
        currency: 'SEK',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
      connection: null,
    },
    {
      account: {
        id: newId,
        name: 'Synthetic account',
        iban: 'SYNTHETIC',
        currency: 'SEK',
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
      },
      connection: { name: 'Enable Banking Example', status: 'connected', lastSyncedAt: null },
    },
  ]
  const db = {
    select: () => ({
      from: () => {
        let kind: 'owner' | 'accounts' | 'source' = 'owner'
        const query = {
          leftJoin: () => {
            kind = 'accounts'
            return query
          },
          innerJoin: () => {
            kind = 'source'
            return query
          },
          where: (condition: Parameters<PgDialect['sqlToQuery']>[0]) => {
            statements.push(new PgDialect().sqlToQuery(condition))
            if (kind === 'owner')
              return { limit: async () => (options.owner === false ? [] : [{ id: workspaceId }]) }
            if (kind === 'accounts') return Promise.resolve(options.selected === false ? [] : rows)
            return Promise.resolve(options.connected === false ? [] : sources)
          },
        }
        return query
      },
    }),
  } as unknown as Database
  return { db, statements }
}

function provider(transactions: z.infer<typeof preliminaryTransactionSchema>[]) {
  vi.mocked(getEnableBankingPreliminaryTransactions).mockImplementation(async (_id, options) => {
    await options.authorize()
    return {
      entries: transactions.map((transaction) => ({ transaction, retrievedAt })),
      retrieval: {
        complete: true,
        incompleteReason: null,
        pagesRetrieved: 1,
        startedAt: retrievedAt,
        retrievedAt,
      },
    }
  })
}

describe('business preliminary entries', () => {
  it('resolves the canonical alias to the current provider and enforces workspace and inclusion in SQL', async () => {
    const { db, statements } = mockDb()
    provider([{ status: 'PDNG', value_date: '2026-01-20' }])
    const result = await new BusinessUpcomingPaymentService(db, workspaceId).listPayments(input)
    expect(getEnableBankingPreliminaryTransactions).toHaveBeenCalledWith(
      'current-provider-account',
      expect.anything(),
    )
    expect(result.entries[0]).toMatchObject({
      accountId: oldId,
      accountName: 'Synthetic account',
      bankName: 'Example',
    })
    const [owner, accounts, source] = statements
    expect(owner.params).toEqual([workspaceId, 'business'])
    expect(accounts.params).toEqual([workspaceId, true])
    expect(source.params).toEqual([
      workspaceId,
      true,
      newId,
      oldId,
      workspaceId,
      'enable_banking',
      'connected',
    ])
    expect(source.sql).toContain('"bank_connection"."workspace_id"')
    expect(result.retrieval.complete).toBe(true)
  })

  it('preserves precision, both directions, source schemes, missing fields and identical instructions', async () => {
    const { db } = mockDb()
    const debit = {
      status: 'PDNG',
      transaction_amount: { amount: '9007199254740993.00100', currency: 'SEK' },
      credit_debit_indicator: 'DBIT',
      value_date: '2026-01-20',
      creditor_account: { other: { identification: '123456', scheme_name: 'BBAN' } },
    } as const
    provider([
      debit,
      debit,
      { status: 'PDNG', credit_debit_indicator: 'CRDT' },
      { status: 'SCHD', value_date: '2026-01-01' },
    ])
    const result = businessUpcomingPaymentsSchema.parse(
      await new BusinessUpcomingPaymentService(db, workspaceId).listPayments(input),
    )
    expect(result.entries).toHaveLength(4)
    expect(result.entries[0]).toEqual(result.entries[1])
    expect(result.entries[0]).toMatchObject({
      amount: '9007199254740993.00100',
      creditDebitIndicator: 'DBIT',
      creditorAccount: { other: { identification: '123456', schemeName: 'BBAN' } },
      valueDate: '2026-01-20',
      signingStatus: 'not_provided',
    })
    expect(result.entries[2]).toMatchObject({
      amount: null,
      currency: null,
      creditorName: null,
      creditorAccount: null,
      referenceNumber: null,
      valueDate: null,
      bookingDate: null,
      transactionDate: null,
      dateRangeMatch: 'unknown',
      providerTransactionId: null,
      entryReference: null,
      signingStatus: 'not_provided',
      creditDebitIndicator: 'CRDT',
    })
    expect(result.instructionCoverage).toBe('not_guaranteed')
  })

  it('includes same-day and card entries, filters by value_date alone and counts excluded statuses', async () => {
    const { db } = mockDb()
    provider([
      { status: 'PDNG', value_date: input.dateFrom, merchant_category_code: '1234' },
      { status: 'PDNG', value_date: input.dateTo },
      { status: 'PDNG', value_date: '2026-02-02', transaction_date: input.dateFrom },
      { status: 'PDNG', booking_date: '2025-01-01' },
      ...['BOOK', 'CNCL', 'HOLD', 'OTHR', 'RJCT', 'NEW_STATUS'].map((status) => ({ status })),
      {},
    ])
    const result = await new BusinessUpcomingPaymentService(db, workspaceId).listPayments(input)
    expect(result.entries).toHaveLength(3)
    expect(result.entries[0].merchantCategoryCode).toBe('1234')
    expect(result.entries[2].dateRangeMatch).toBe('unknown')
    expect(result.excludedByValueDateCount).toBe(1)
    expect(result.excludedStatusCounts).toHaveLength(7)
    expect(result.excludedStatusCounts).toContainEqual({ providerStatus: null, count: 1 })
  })

  it.each([
    { selected: false },
    { connected: false },
    { expired: true },
    { owner: false },
  ])('fails closed for unavailable selections/connections: %j', async (options) => {
    const { db } = mockDb(options)
    await expect(
      new BusinessUpcomingPaymentService(db, workspaceId).listPayments(input),
    ).rejects.toThrow(/unavailable|expired/)
    expect(getEnableBankingPreliminaryTransactions).not.toHaveBeenCalled()
  })

  it.each([
    '00000000-0000-4000-8000-000000000099',
    newId,
  ])('rejects foreign/private IDs and noncanonical aliases: %s', async (accountId) => {
    const { db } = mockDb()
    await expect(
      new BusinessUpcomingPaymentService(db, workspaceId).listPayments({ ...input, accountId }),
    ).rejects.toThrow('Selected business account is unavailable')
    expect(getEnableBankingPreliminaryTransactions).not.toHaveBeenCalled()
  })

  it('requires explicit business scope and validates dates before any fetching', async () => {
    const { db } = mockDb()
    await expect(new BusinessUpcomingPaymentService(db, '').listPayments(input)).rejects.toThrow(
      'Configured business workspace',
    )
    expect(
      listBusinessUpcomingPaymentsInputSchema.safeParse({ ...input, dateTo: '2027-01-01' }).success,
    ).toBe(false)
    expect(
      listBusinessUpcomingPaymentsInputSchema.safeParse({ ...input, dateTo: '2025-01-01' }).success,
    ).toBe(false)
    expect(
      listBusinessUpcomingPaymentsInputSchema.safeParse({ ...input, dateTo: '2026-02-30' }).success,
    ).toBe(false)
    expect(getEnableBankingPreliminaryTransactions).not.toHaveBeenCalled()
  })
})
