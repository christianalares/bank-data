import { generateKeyPairSync } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { enableBankingRequest, getEnableBankingTransactions } from './index'

describe('getEnableBankingTransactions', () => {
  beforeEach(() => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    })

    process.env.ENABLE_BANKING_APPLICATION_ID = 'test-application'
    process.env.ENABLE_BANKING_PRIVATE_KEY_BASE64 = Buffer.from(
      privateKey.export({ format: 'pem', type: 'pkcs8' }),
    ).toString('base64')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.ENABLE_BANKING_APPLICATION_ID
    delete process.env.ENABLE_BANKING_PRIVATE_KEY_BASE64
  })

  it('uses the longest strategy for an initial history import and keeps it while paginating', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [{ transaction_id: 'first', status: 'BOOK' }],
            continuation_key: 'next-page',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [{ transaction_id: 'second', status: 'BOOK' }],
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const transactions = await getEnableBankingTransactions('account/1', {
      dateFrom: '2023-07-25',
      strategy: 'longest',
    })

    expect(transactions).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const firstUrl = new URL(fetchMock.mock.calls[0]?.[0] as string)
    expect(firstUrl.pathname).toBe('/accounts/account%2F1/transactions')
    expect(firstUrl.searchParams.get('date_from')).toBe('2023-07-25')
    expect(firstUrl.searchParams.get('strategy')).toBe('longest')
    expect(firstUrl.searchParams.get('transaction_status')).toBe('BOOK')

    const secondUrl = new URL(fetchMock.mock.calls[1]?.[0] as string)
    expect(secondUrl.searchParams.get('strategy')).toBe('longest')
    expect(secondUrl.searchParams.get('continuation_key')).toBe('next-page')
  })

  it('uses the default strategy for ongoing syncs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          transactions: [],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await getEnableBankingTransactions('account-1', {
      dateFrom: '2026-07-13',
    })

    const url = new URL(fetchMock.mock.calls[0]?.[0] as string)
    expect(url.searchParams.get('strategy')).toBe('default')
  })

  it('excludes pending transactions returned by the provider on every page', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              { transaction_id: 'booked-first', status: 'BOOK' },
              { transaction_id: 'pending-first', status: 'PDNG' },
            ],
            continuation_key: 'next-page',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              { transaction_id: 'pending-second', status: 'PDNG' },
              { transaction_id: 'booked-second', status: 'BOOK' },
            ],
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const transactions = await getEnableBankingTransactions('account-1', {
      dateFrom: '2026-07-13',
    })

    expect(transactions.map((transaction) => transaction.transaction_id)).toEqual([
      'booked-first',
      'booked-second',
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [url] of fetchMock.mock.calls) {
      expect(new URL(url as string).searchParams.get('transaction_status')).toBe('BOOK')
    }
  })

  it('bounds provider requests and reports a useful timeout', async () => {
    const timeoutError = new Error('The operation was aborted due to timeout')
    timeoutError.name = 'TimeoutError'
    const fetchMock = vi.fn().mockRejectedValue(timeoutError)
    vi.stubGlobal('fetch', fetchMock)

    await expect(enableBankingRequest('/auth', { timeoutMs: 25 })).rejects.toThrow(
      'Enable Banking did not respond in time. Please try again.',
    )

    const requestOptions = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(requestOptions.signal).toBeInstanceOf(AbortSignal)
  })
})
