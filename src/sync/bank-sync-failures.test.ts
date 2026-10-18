import { generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { bankConnection, Database } from '#db'
import { runBankSync } from './bank-sync'

type BankConnection = typeof bankConnection.$inferSelect

function connection(id: string, overrides: Partial<BankConnection> = {}): BankConnection {
  return {
    id,
    workspaceId: 'test-workspace',
    provider: 'enable_banking',
    providerConnectionId: `session-${id}`,
    name: `Bank ${id}`,
    status: 'connected',
    errorMessage: null,
    rawMetadata: null,
    encryptedPersonalPayload: null,
    lastSyncedAt: new Date('2026-10-17T02:00:00Z'),
    consentValidUntil: new Date('2027-01-01T00:00:00Z'),
    disconnectedAt: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-17T02:00:00Z'),
    ...overrides,
  }
}

function database(connections: BankConnection[]) {
  const persisted: Record<string, unknown>[] = []
  const write = vi.fn().mockResolvedValue(undefined)
  const account = {
    id: 'test-account',
    providerAccountId: 'provider-account',
    name: 'Test account',
    currency: 'SEK',
    included: true,
    encryptedPersonalPayload: null,
  }
  const db = {
    query: {
      bankConnection: {
        findMany: vi.fn().mockResolvedValueOnce([]).mockResolvedValue(connections),
      },
      workspace: { findFirst: vi.fn().mockResolvedValue({ kind: 'business' }) },
      bankAccount: { findMany: vi.fn().mockResolvedValue([account]) },
    },
    update: vi.fn().mockReturnValue({
      set: (values: Record<string, unknown>) => {
        persisted.push(values)
        return { where: write }
      },
    }),
    insert: vi.fn().mockReturnValue({
      values: () => ({
        onConflictDoUpdate: () => ({ returning: async () => [account] }),
      }),
    }),
  }
  return { db, persisted, write }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

describe('bank sync provider failures', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T02:00:00Z'))
    vi.stubEnv('ENABLE_BANKING_APPLICATION_ID', 'test-application')
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    vi.stubEnv(
      'ENABLE_BANKING_PRIVATE_KEY_BASE64',
      Buffer.from(privateKey.export({ format: 'pem', type: 'pkcs8' })).toString('base64'),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reports the Nordea upstream error and still syncs the next connection', async () => {
    const { db, persisted } = database([connection('nordea'), connection('healthy')])
    const fetchMock = vi.fn().mockImplementation((_url: string) => {
      if (fetchMock.mock.calls.length <= 3) {
        return Promise.resolve(
          jsonResponse(
            {
              code: 400,
              message: 'Error interacting with ASPSP',
              detail: { message: 'Internal server error', error_name: 'HttpException' },
              error: 'ASPSP_ERROR',
            },
            400,
          ),
        )
      }
      return Promise.resolve(jsonResponse({ balances: [], transactions: [] }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = runBankSync({ overlapDays: 14 }, db as unknown as Database)
    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(result).toMatchObject({
      status: 'partial',
      syncedConnections: 1,
      failedConnections: 1,
      syncedAccounts: 1,
      failures: [{ connectionId: 'nordea', status: 'error' }],
    })
    expect(result.failures[0].message).toContain('ASPSP_ERROR')
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(persisted).toEqual([
      expect.objectContaining({ status: 'error', disconnectedAt: null }),
      expect.objectContaining({ status: 'connected', errorMessage: null }),
    ])
    expect(persisted[0]).not.toHaveProperty('lastSyncedAt')
  })

  it('completes with a partial result even when every bank is unavailable', async () => {
    const { db } = database([connection('unavailable')])
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response('', { status: 503 })))
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = runBankSync({ overlapDays: 14 }, db as unknown as Database)
    await vi.runAllTimersAsync()

    expect(await resultPromise).toMatchObject({
      status: 'partial',
      syncedConnections: 0,
      failedConnections: 1,
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('reports rate limits without retrying or advancing freshness', async () => {
    const { db, persisted } = database([connection('limited')])
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'ASPSP_RATE_LIMIT_EXCEEDED' }, 429))
    vi.stubGlobal('fetch', fetchMock)

    expect(await runBankSync({ overlapDays: 14 }, db as unknown as Database)).toMatchObject({
      status: 'partial',
      failedConnections: 1,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(persisted[0]).not.toHaveProperty('lastSyncedAt')
  })

  it('recovers a previously failed connection on the next successful run', async () => {
    const { db, persisted } = database([
      connection('recovered', { status: 'error', errorMessage: 'Previous upstream failure' }),
    ])
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(jsonResponse({ balances: [], transactions: [] })),
        ),
    )

    expect(await runBankSync({ overlapDays: 14 }, db as unknown as Database)).toMatchObject({
      status: 'success',
      syncedConnections: 1,
      failedConnections: 0,
      failures: [],
    })
    expect(persisted[0]).toMatchObject({
      status: 'connected',
      errorMessage: null,
      lastSyncedAt: new Date(),
    })
  })

  it('reports an active backoff without making a provider request', async () => {
    const { db } = database([
      connection('limited', {
        status: 'error',
        errorMessage: 'Enable Banking request failed (429): ASPSP_RATE_LIMIT_EXCEEDED',
        updatedAt: new Date(),
      }),
    ])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await runBankSync({ overlapDays: 14 }, db as unknown as Database)).toMatchObject({
      status: 'partial',
      deferredConnections: 1,
      failedConnections: 1,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps consent expiry visible as a disconnected connection', async () => {
    const { db, persisted } = database([
      connection('expired', { consentValidUntil: new Date('2026-10-17T00:00:00Z') }),
    ])

    expect(await runBankSync({ overlapDays: 14 }, db as unknown as Database)).toMatchObject({
      status: 'partial',
      failures: [
        { connectionId: 'expired', status: 'disconnected', message: 'Bank consent expired' },
      ],
    })
    expect(persisted[0]).toMatchObject({ status: 'disconnected', disconnectedAt: new Date() })
  })

  it('still fails the job for a database error while recording a bank failure', async () => {
    const { db, write } = database([connection('limited')])
    write.mockRejectedValue(new Error('database unavailable'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 429)))

    await expect(runBankSync({ overlapDays: 14 }, db as unknown as Database)).rejects.toThrow(
      'database unavailable',
    )
  })

  it('still fails the job for invalid provider credentials', async () => {
    const { db } = database([connection('invalid')])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'INVALID_SIGNATURE' }, 400)),
    )

    await expect(runBankSync({ overlapDays: 14 }, db as unknown as Database)).rejects.toThrow(
      'INVALID_SIGNATURE',
    )
  })

  it('still fails the job for application configuration errors', async () => {
    const { db } = database([connection('invalid')])
    vi.stubEnv('ENABLE_BANKING_APPLICATION_ID', '')

    const assertion = expect(
      runBankSync({ overlapDays: 14 }, db as unknown as Database),
    ).rejects.toThrow('ENABLE_BANKING_APPLICATION_ID is required')
    await vi.runAllTimersAsync()
    await assertion
  })

  it('still fails the job for data-integrity errors', async () => {
    const { db } = database([connection('invalid')])
    db.query.workspace.findFirst.mockResolvedValue(undefined)

    await expect(runBankSync({ overlapDays: 14 }, db as unknown as Database)).rejects.toThrow(
      'Bank connection workspace not found',
    )
  })
})
