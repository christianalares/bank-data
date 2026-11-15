import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bankAccount,
  bankConnection,
  bankFetchState,
  bankTransaction,
  bankUpcomingSnapshot,
  closeDb,
  createDb,
  type Database,
  user,
  workspace,
} from '#db'
import { businessUpcomingPaymentsSchema } from '../finance/upcoming-payment-schemas'
import { BusinessUpcomingPaymentService } from '../finance/upcoming-payment-service'
import { createFinanceMcpServer } from '../mcp/mcp-server'
import { runBankSync } from './bank-sync'
import { withCoordinatedBankFetch } from './fetch-coordinator'
import { refreshBusinessUpcomingObservations } from './upcoming-observations'

const enabled = Boolean(process.env.BANK_OBSERVATION_TEST_DATABASE_URL)
let db: Database
let ownerId: string
let scope: string
let connection: typeof bankConnection.$inferSelect
let account: typeof bankAccount.$inferSelect
let canonicalId: string
let key: string
const today = new Date().toISOString().slice(0, 10)
const debit = {
  status: 'PDNG',
  value_date: today,
  transaction_amount: { amount: '9007199254740993.00100', currency: 'SEK' },
  credit_debit_indicator: 'DBIT',
}
const response = (transactions: unknown[], continuation_key?: string) =>
  new Response(JSON.stringify({ transactions, continuation_key }), { status: 200 })
const read = () =>
  new BusinessUpcomingPaymentService(db, scope).listPayments({
    accountId: canonicalId,
    dateFrom: today,
    dateTo: today,
  })
const refresh = () =>
  withCoordinatedBankFetch(db, scope, null, () => refreshBusinessUpcomingObservations(db, account))
const allowRefresh = () =>
  db
    .update(bankFetchState)
    .set({ nextAllowedAt: new Date(0) })
    .where(eq(bankFetchState.workspaceId, scope))

beforeAll(() => {
  if (!enabled) return
  db = createDb(process.env.BANK_OBSERVATION_TEST_DATABASE_URL)
  key = Buffer.from(
    generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
      format: 'pem',
      type: 'pkcs8',
    }),
  ).toString('base64')
})
afterAll(async () => {
  if (enabled) await closeDb()
})

describe.skipIf(!enabled)('stored observations and shared database coordination', () => {
  beforeEach(async () => {
    ownerId = randomUUID()
    scope = randomUUID()
    vi.stubEnv('ENABLE_BANKING_APPLICATION_ID', 'synthetic')
    vi.stubEnv('ENABLE_BANKING_PRIVATE_KEY_BASE64', key)
    await db
      .insert(user)
      .values({ id: ownerId, name: 'Synthetic test', email: `${ownerId}@example.invalid` })
    await db
      .insert(workspace)
      .values({ id: scope, ownerId, name: 'Synthetic business', kind: 'business' })
    ;[connection] = await db
      .insert(bankConnection)
      .values({
        workspaceId: scope,
        provider: 'enable_banking',
        providerConnectionId: randomUUID(),
        name: 'Enable Banking Synthetic',
        status: 'connected',
        consentValidUntil: new Date(Date.now() + 86_400_000),
      })
      .returning()
    ;[account] = await db
      .insert(bankAccount)
      .values({
        workspaceId: scope,
        connectionId: connection.id,
        providerAccountId: randomUUID(),
        name: 'Synthetic account',
        iban: 'SYNTHETIC-ACCOUNT',
        included: true,
        createdAt: new Date(),
      })
      .returning()
    const [old] = await db
      .insert(bankAccount)
      .values({
        workspaceId: scope,
        providerAccountId: randomUUID(),
        name: 'Historical alias',
        iban: 'SYNTHETIC-ACCOUNT',
        included: true,
        createdAt: new Date(Date.now() - 86_400_000),
      })
      .returning()
    canonicalId = old.id
  })
  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    await db.delete(user).where(inArray(user.id, [ownerId, `${ownerId}-foreign`]))
  })

  it('stores duplicates with exact source precision and serves concurrent/repeated reads without fetching', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () =>
        response([debit, debit, { status: 'SCHD', credit_debit_indicator: 'CRDT' }]),
      )
    vi.stubGlobal('fetch', fetch)
    await refresh()
    const results = await Promise.all([read(), read(), read()])
    for (const raw of results) {
      const result = businessUpcomingPaymentsSchema.parse(raw)
      expect(result.entries).toHaveLength(3)
      expect(result.entries[0]).toMatchObject({
        amount: '9007199254740993.00100',
        providerTransactionId: null,
        entryReference: null,
        signingStatus: 'not_provided',
        accountId: canonicalId,
      })
      expect(result.entries[0]).toEqual(result.entries[1])
      expect(result.entries[2]).toMatchObject({
        valueDate: null,
        dateRangeMatch: 'unknown',
        creditDebitIndicator: 'CRDT',
      })
      expect(result.observation).toMatchObject({
        dataAvailable: true,
        requestedRangeCovered: true,
        stale: false,
      })
    }
    vi.stubEnv('DATABASE_URL', process.env.BANK_OBSERVATION_TEST_DATABASE_URL!)
    vi.stubEnv('BANK_CONSENT_BUSINESS_WORKSPACE_ID', scope)
    const server = createFinanceMcpServer({ mode: 'business' })
    const client = new Client({ name: 'stored-read-test', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
      for (let i = 0; i < 2; i++) {
        const reply = await client.callTool({
          name: 'list_business_upcoming_payments',
          arguments: { accountId: canonicalId, dateFrom: today, dateTo: today },
        })
        expect(reply.isError).not.toBe(true)
        expect(businessUpcomingPaymentsSchema.parse(reply.structuredContent).entries).toHaveLength(
          3,
        )
      }
    } finally {
      await client.close()
      await server.close()
    }
    expect(fetch).toHaveBeenCalledTimes(1)
    expect((await read()).refresh.blocked).toBe(true)
    expect(
      await db.select().from(bankTransaction).where(eq(bankTransaction.workspaceId, scope)),
    ).toEqual([])
  })

  it('rejects refreshes that bypass the shared coordinator', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(refreshBusinessUpcomingObservations(db, account)).rejects.toThrow(
      'coordinated bank sync',
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves the complete snapshot after partial pages and a 429, extending the shared cooldown', async () => {
    const fetch = vi.fn().mockImplementation(async () => response([debit]))
    vi.stubGlobal('fetch', fetch)
    await refresh()
    const before = await read()
    await allowRefresh()
    fetch
      .mockResolvedValueOnce(response([{ ...debit, transaction_id: 'partial-only' }], 'next'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: 'ASPSP_RATE_LIMIT_EXCEEDED', detail: 'private response body' }),
          { status: 429, headers: { 'Retry-After': '30000' } },
        ),
      )
    await expect(refresh()).rejects.toThrow('incomplete')
    const after = await read()
    expect(after.observation.snapshotId).toBe(before.observation.snapshotId)
    expect(after.retrieval?.retrievedAt).toBe(before.retrieval?.retrievedAt)
    expect(after.entries).toEqual(before.entries)
    expect(after.observation.stale).toBe(true)
    expect(after.refresh).toMatchObject({
      lastAttemptComplete: false,
      failure: { kind: 'rate_limited', httpStatus: 429, retryAfterSeconds: 30000 },
    })
    expect(after.refresh.lastObservationAttempt).toMatchObject({
      complete: false,
      pagesRetrieved: 1,
      failure: { kind: 'rate_limited' },
    })
    expect(new Date(after.refresh.nextAllowedAt!).getTime()).toBeGreaterThan(
      Date.now() + 29_900_000,
    )
    expect(await refresh()).toMatchObject({ deferred: true, reason: 'cooldown' })
    expect(fetch).toHaveBeenCalledTimes(3)
    const attempts = await db
      .select()
      .from(bankUpcomingSnapshot)
      .where(eq(bankUpcomingSnapshot.workspaceId, scope))
    expect(attempts).toHaveLength(2)
    expect(attempts.find((a) => !a.complete)?.entries[0].transaction.transaction_id).toBe(
      'partial-only',
    )
  })

  it('treats a complete empty observation as current and marks old/out-of-range observations explicitly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => response([debit])),
    )
    await refresh()
    await db
      .update(bankUpcomingSnapshot)
      .set({ retrievedAt: new Date(Date.now() - 7 * 3600_000) })
      .where(eq(bankUpcomingSnapshot.workspaceId, scope))
    expect((await read()).observation.stale).toBe(true)
    expect(
      (
        await new BusinessUpcomingPaymentService(db, scope).listPayments({
          accountId: canonicalId,
          dateFrom: '2001-01-01',
          dateTo: '2001-01-02',
        })
      ).observation.requestedRangeCovered,
    ).toBe(false)
    await allowRefresh()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => response([])),
    )
    await refresh()
    const result = await read()
    expect(result.entries).toEqual([])
    expect(result.observation).toMatchObject({ dataAvailable: true, stale: false })
    expect(result.retrieval?.complete).toBe(true)
  })

  it('distinguishes a never-successful observation from a successful empty one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response('{}', { status: 503 })),
    )
    await expect(refresh()).rejects.toThrow('incomplete')
    const result = await read()
    expect(result.entries).toEqual([])
    expect(result.observation.dataAvailable).toBe(false)
    expect(result.retrieval).toBeNull()
    expect(result.refresh.failure?.kind).toBe('provider_error')
  })

  it('serializes independent database transactions and preserves cooldown on failed work', async () => {
    let release!: () => void
    let started!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    const first = withCoordinatedBankFetch(db, scope, null, async () => {
      started()
      await gate
    })
    await entered
    const secondOperation = vi.fn()
    const second = await withCoordinatedBankFetch(db, scope, null, secondOperation)
    expect(second).toMatchObject({ deferred: true, reason: 'in_progress' })
    expect(secondOperation).not.toHaveBeenCalled()
    release()
    await first
    expect(await withCoordinatedBankFetch(db, scope, null, secondOperation)).toMatchObject({
      deferred: true,
      reason: 'cooldown',
    })
    await allowRefresh()
    await expect(
      withCoordinatedBankFetch(db, scope, null, async () => {
        throw new Error('synthetic failed work')
      }),
    ).rejects.toThrow('synthetic failed work')
    expect(await withCoordinatedBankFetch(db, scope, null, secondOperation)).toMatchObject({
      deferred: true,
      reason: 'cooldown',
    })
    expect(secondOperation).not.toHaveBeenCalled()
  })

  it('does not expose stored data after exclusion, revocation, expiry, renewal or a foreign account request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => response([debit])),
    )
    await refresh()
    await db.update(bankAccount).set({ included: false }).where(eq(bankAccount.id, account.id))
    await expect(read()).rejects.toThrow('unavailable')
    await db.update(bankAccount).set({ included: true }).where(eq(bankAccount.id, account.id))
    await db
      .update(bankConnection)
      .set({ status: 'disconnected' })
      .where(eq(bankConnection.id, connection.id))
    await expect(read()).rejects.toThrow('unavailable')
    await db
      .update(bankConnection)
      .set({ status: 'connected', consentValidUntil: new Date(0) })
      .where(eq(bankConnection.id, connection.id))
    await expect(read()).rejects.toMatchObject({ failure: { kind: 'consent_expired' } })
    await db
      .update(bankConnection)
      .set({ consentValidUntil: new Date(Date.now() + 86_400_000) })
      .where(eq(bankConnection.id, connection.id))
    const [renewed] = await db
      .insert(bankConnection)
      .values({
        workspaceId: scope,
        provider: 'enable_banking',
        providerConnectionId: randomUUID(),
        name: 'Synthetic renewed',
        status: 'connected',
      })
      .returning()
    await db.insert(bankAccount).values({
      workspaceId: scope,
      connectionId: renewed.id,
      providerAccountId: randomUUID(),
      name: 'Renewed source',
      iban: account.iban,
      included: true,
      createdAt: new Date(Date.now() + 1000),
    })
    expect((await read()).observation.dataAvailable).toBe(false)
    for (const kind of ['personal', 'business'] as const) {
      const foreignOwner = kind === 'personal' ? ownerId : `${ownerId}-foreign`
      if (kind === 'business')
        await db.insert(user).values({
          id: foreignOwner,
          name: 'Synthetic foreign owner',
          email: `${foreignOwner}@example.invalid`,
        })
      const [otherScope] = await db
        .insert(workspace)
        .values({ ownerId: foreignOwner, name: 'Synthetic foreign scope', kind })
        .returning()
      const [otherConnection] = await db
        .insert(bankConnection)
        .values({
          workspaceId: otherScope.id,
          provider: 'enable_banking',
          providerConnectionId: randomUUID(),
          name: 'Synthetic source',
          status: 'connected',
        })
        .returning()
      const [otherAccount] = await db
        .insert(bankAccount)
        .values({
          workspaceId: otherScope.id,
          connectionId: otherConnection.id,
          providerAccountId: randomUUID(),
          name: 'Synthetic account',
          iban: account.iban,
          included: true,
        })
        .returning()
      await expect(
        new BusinessUpcomingPaymentService(db, scope).listPayments({
          accountId: otherAccount.id,
          dateFrom: today,
          dateTo: today,
        }),
      ).rejects.toThrow('unavailable')
    }
    await expect(
      new BusinessUpcomingPaymentService(db, scope).listPayments({
        accountId: randomUUID(),
        dateFrom: today,
        dateTo: today,
      }),
    ).rejects.toThrow('unavailable')
  })

  it('extends the existing sync, keeping preliminary observations out of the booked ledger', async () => {
    // Avoid an archived connectionless alias in the selected sync fixture.
    await db.delete(bankAccount).where(eq(bankAccount.id, canonicalId))
    canonicalId = account.id
    const fetch = vi.fn().mockImplementation(async (url: string) => {
      const parsed = new URL(url)
      if (parsed.pathname.endsWith('/balances'))
        return new Response(JSON.stringify({ balances: [] }))
      if (parsed.searchParams.get('transaction_status') === 'BOOK')
        return response([
          {
            transaction_id: 'synthetic-booked',
            status: 'BOOK',
            booking_date: today,
            transaction_amount: { amount: '1.00', currency: 'SEK' },
            credit_debit_indicator: 'DBIT',
          },
          debit,
        ])
      return response([debit])
    })
    vi.stubGlobal('fetch', fetch)
    expect(await runBankSync({ workspaceId: scope, overlapDays: 14 }, db)).toMatchObject({
      status: 'success',
      syncedConnections: 1,
      syncedTransactions: 1,
    })
    const ledger = await db
      .select()
      .from(bankTransaction)
      .where(and(eq(bankTransaction.workspaceId, scope), eq(bankTransaction.status, 'booked')))
    expect(ledger).toHaveLength(1)
    expect(ledger[0].providerTransactionId).toBe('synthetic-booked')
    expect((await read()).entries).toHaveLength(1)
    const calls = fetch.mock.calls.length
    expect(await runBankSync({ workspaceId: scope, overlapDays: 14 }, db)).toMatchObject({
      deferredConnections: 1,
    })
    await read()
    await read()
    expect(fetch).toHaveBeenCalledTimes(calls)
  })
})
