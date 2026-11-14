import { generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getEnableBankingPreliminaryTransactions,
  UPCOMING_PAYMENT_LIMITS,
} from './upcoming-payments'

let key: string
beforeAll(() => {
  key = Buffer.from(
    generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
      format: 'pem',
      type: 'pkcs8',
    }),
  ).toString('base64')
})
beforeEach(() => {
  vi.stubEnv('ENABLE_BANKING_APPLICATION_ID', 'synthetic-application')
  vi.stubEnv('ENABLE_BANKING_PRIVATE_KEY_BASE64', key)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

const filters = { dateFrom: '2026-01-01', dateTo: '2026-02-01' }
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

describe('preliminary provider reads', () => {
  it('omits the status filter and continues after an empty page, authorizing every page', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ transactions: [], continuation_key: 'next' }))
      .mockResolvedValueOnce(
        response({ transactions: [{ status: 'PDNG', value_date: '2026-01-20' }] }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const authorize = vi.fn().mockResolvedValue(undefined)
    const result = await getEnableBankingPreliminaryTransactions('account/1', {
      ...filters,
      authorize,
    })
    expect(result.entries).toHaveLength(1)
    expect(result.retrieval).toMatchObject({
      complete: true,
      incompleteReason: null,
      pagesRetrieved: 2,
    })
    expect(authorize).toHaveBeenCalledTimes(3)
    const urls = fetchMock.mock.calls.map(([url]) => new URL(url))
    expect(urls[0].pathname).toBe('/accounts/account%2F1/transactions')
    for (const url of urls) {
      expect(Object.fromEntries(url.searchParams)).toMatchObject({
        date_from: filters.dateFrom,
        date_to: filters.dateTo,
        strategy: 'default',
      })
      expect(url.searchParams.has('transaction_status')).toBe(false)
      expect(url.searchParams.has('limit')).toBe(false)
    }
    expect(urls[1].searchParams.get('continuation_key')).toBe('next')
  })

  it('reports repeated cursors as incomplete without inventing IDs or deduplicating entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(async () =>
          response({ transactions: [{ status: 'PDNG' }], continuation_key: 'repeat' }),
        ),
    )
    const result = await getEnableBankingPreliminaryTransactions('account', {
      ...filters,
      authorize: async () => {},
    })
    expect(result.retrieval).toMatchObject({
      complete: false,
      incompleteReason: 'repeated_cursor',
      pagesRetrieved: 2,
    })
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0].transaction.transaction_id).toBeUndefined()
  })

  it('bounds the number of provider pages', async () => {
    let page = 0
    const fetchMock = vi
      .fn()
      .mockImplementation(async () =>
        response({ transactions: [], continuation_key: `page-${++page}` }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const result = await getEnableBankingPreliminaryTransactions('account', {
      ...filters,
      authorize: async () => {},
    })
    expect(fetchMock).toHaveBeenCalledTimes(UPCOMING_PAYMENT_LIMITS.pages)
    expect(result.retrieval).toMatchObject({ complete: false, incompleteReason: 'page_limit' })
  })

  it('reports a truncated oversized page as incomplete', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          transactions: Array.from({ length: UPCOMING_PAYMENT_LIMITS.entries + 1 }, () => ({
            status: 'PDNG',
          })),
        }),
      ),
    )
    const result = await getEnableBankingPreliminaryTransactions('account', {
      ...filters,
      authorize: async () => {},
    })
    expect(result.entries).toHaveLength(UPCOMING_PAYMENT_LIMITS.entries)
    expect(result.retrieval).toMatchObject({ complete: false, incompleteReason: 'entry_limit' })
  })

  it('bounds elapsed time across pages and supplies a request deadline', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockImplementation(async () => {
      vi.setSystemTime(Date.now() + UPCOMING_PAYMENT_LIMITS.timeoutMs + 1)
      return response({ transactions: [], continuation_key: 'next' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await getEnableBankingPreliminaryTransactions('account', {
      ...filters,
      authorize: async () => {},
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    expect(result.retrieval).toMatchObject({ complete: false, incompleteReason: 'time_limit' })
  })

  it.each([
    401, 422, 429, 500,
  ])('does not turn a first-page HTTP %s into an empty success', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('private provider detail', { status })),
    )
    await expect(
      getEnableBankingPreliminaryTransactions('account', { ...filters, authorize: async () => {} }),
    ).rejects.toThrow('could not be retrieved')
  })

  it.each([
    'provider_error',
    'invalid_response',
  ] as const)('reports %s after a successful empty page as incomplete', async (reason) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ transactions: [], continuation_key: 'next' }))
    if (reason === 'provider_error')
      fetchMock.mockRejectedValueOnce(new TypeError('network failure'))
    else fetchMock.mockResolvedValueOnce(response({}))
    vi.stubGlobal('fetch', fetchMock)
    const result = await getEnableBankingPreliminaryTransactions('account', {
      ...filters,
      authorize: async () => {},
    })
    expect(result.entries).toEqual([])
    expect(result.retrieval).toMatchObject({
      complete: false,
      incompleteReason: reason,
      pagesRetrieved: 1,
    })
  })

  it('discards partial results when authorization changes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ transactions: [{ status: 'PDNG' }], continuation_key: 'next' }))
    vi.stubGlobal('fetch', fetchMock)
    const authorize = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error('revoked'))
    await expect(
      getEnableBankingPreliminaryTransactions('account', { ...filters, authorize }),
    ).rejects.toThrow('revoked')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
