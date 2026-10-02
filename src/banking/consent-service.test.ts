import { generateKeyPairSync } from 'node:crypto'
import { createServer } from 'node:net'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeDb, createDb, user, workspace } from '#db'
import { startHttpServer } from '../mcp/http-server'
import {
  getConsentRedirectUrl,
  makeSelectionCookie,
  readSelectionCookie,
  startBankConsent,
} from './consent-service'

describe('consent callback guards', () => {
  it('signs short-lived selection cookies and rejects tampering', () => {
    process.env.BANK_CONSENT_MCP_TOKEN = 'consent-test-token-0123456789abcdef0123456789'
    process.env.BANK_CONSENT_COOKIE_SECRET = 'cookie-test-secret-0123456789abcdef0123456789'
    process.env.MCP_API_TOKEN = 'business-test-token-0123456789abcdef0123456789'
    const connectionId = 'eb5092df-010a-4d6e-a755-d28670137002'
    const cookie = makeSelectionCookie(connectionId, 1_800_000_000_000)

    expect(readSelectionCookie(cookie, 1_800_000_001_000)).toBe(connectionId)
    expect(readSelectionCookie(cookie, 1_800_001_000_000)).toBeNull()
    expect(
      readSelectionCookie(cookie.replace('eb5092df', 'ab5092df'), 1_800_000_001_000),
    ).toBeNull()
  })

  it('requires a fixed HTTPS callback origin outside localhost', () => {
    process.env.BANK_CONSENT_REDIRECT_ORIGIN = 'https://bank.example'
    expect(getConsentRedirectUrl()).toBe('https://bank.example/banking/callback')
    process.env.BANK_CONSENT_REDIRECT_ORIGIN = 'http://bank.example'
    expect(() => getConsentRedirectUrl()).toThrow('HTTPS')
    delete process.env.BANK_CONSENT_REDIRECT_ORIGIN
  })
})

const localDatabaseUrl = process.env.CONSENT_TEST_DATABASE_URL

describe.skipIf(!localDatabaseUrl)('bank consent local integration', () => {
  const originalFetch = globalThis.fetch
  let server: Awaited<ReturnType<typeof startHttpServer>>
  let port: number
  let authorizationState = ''
  let providerSessionCount = 0
  let firstConnectionId = ''

  beforeAll(async () => {
    const databaseUrl = new URL(localDatabaseUrl as string)
    if (!['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)) {
      throw new Error('Consent integration tests require an isolated localhost database')
    }
    process.env.DATABASE_URL = localDatabaseUrl
    process.env.BANK_CONSENT_MCP_TOKEN = 'consent-test-token-0123456789abcdef0123456789'
    process.env.BANK_CONSENT_COOKIE_SECRET = 'cookie-test-secret-0123456789abcdef0123456789'
    process.env.MCP_API_TOKEN = 'business-test-token-0123456789abcdef0123456789'
    process.env.PERSONAL_DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.ENABLE_BANKING_APPLICATION_ID = 'test-application'
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    process.env.ENABLE_BANKING_PRIVATE_KEY_BASE64 = Buffer.from(
      privateKey.export({ format: 'pem', type: 'pkcs8' }),
    ).toString('base64')
    port = await reservePort()
    process.env.PORT = String(port)
    process.env.BANK_CONSENT_REDIRECT_ORIGIN = `http://127.0.0.1:${port}`

    const db = createDb()
    await db.insert(user).values({
      id: 'consent-test-user',
      name: 'Consent test',
      email: 'consent-test@example.invalid',
    })
    const [personal] = await db
      .insert(workspace)
      .values({
        name: 'Test personal',
        kind: 'personal',
        ownerId: 'consent-test-user',
      })
      .returning({ id: workspace.id })
    const [business] = await db
      .insert(workspace)
      .values({
        name: 'Test business',
        kind: 'business',
        ownerId: 'consent-test-user',
      })
      .returning({ id: workspace.id })
    process.env.BANK_CONSENT_PERSONAL_WORKSPACE_ID = personal.id
    process.env.BANK_CONSENT_BUSINESS_WORKSPACE_ID = business.id

    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      )
      if (url.hostname === '127.0.0.1') {
        return originalFetch(input, init)
      }
      if (url.pathname === '/auth') {
        const body = JSON.parse(String(init?.body)) as { state: string }
        authorizationState = body.state
        return jsonResponse({ url: 'https://bank.example/authorize' })
      }
      if (url.pathname === '/sessions') {
        providerSessionCount += 1
        return jsonResponse({
          session_id: `mock-session-${providerSessionCount}`,
          accounts: [{ uid: 'mock-account-uid', name: 'Mock account', currency: 'SEK' }],
          aspsp: { name: 'Mock Bank', country: 'SE' },
          access: { valid_until: '2027-01-01T00:00:00Z' },
        })
      }
      if (url.pathname.endsWith('/details')) {
        return jsonResponse({ uid: 'mock-account-uid', name: 'Mock account', currency: 'SEK' })
      }
      if (url.pathname.endsWith('/balances')) {
        return jsonResponse({ balances: [] })
      }
      throw new Error('Unexpected mock provider request')
    })
    server = await startHttpServer()
  })

  afterAll(async () => {
    await server?.close()
    await createDb().delete(user).where(eq(user.id, 'consent-test-user'))
    await closeDb()
    vi.unstubAllGlobals()
  })

  it('restricts MCP tools and completes callback, selection, and renewal', async () => {
    const toolsResponse = await originalFetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.BANK_CONSENT_MCP_TOKEN}`,
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    })
    expect(toolsResponse.status).toBe(200)
    const listed = (await toolsResponse.json()) as { result: { tools: Array<{ name: string }> } }
    expect(listed.result.tools.map((tool) => tool.name).sort()).toEqual([
      'get_bank_consent_status',
      'recover_bank_selection',
      'start_bank_consent',
    ])
    const businessToolsResponse = await originalFetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MCP_API_TOKEN}`,
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    })
    const businessTools = (await businessToolsResponse.json()) as {
      result: { tools: Array<{ name: string }> }
    }
    expect(businessTools.result.tools.map((tool) => tool.name)).not.toContain('start_bank_consent')

    const initiationResponse = await originalFetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.BANK_CONSENT_MCP_TOKEN}`,
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'start_bank_consent',
          arguments: {
            workspaceKind: 'personal',
            aspspName: 'Mock Bank',
            aspspCountry: 'SE',
            renew: false,
          },
        },
      }),
    })
    expect(initiationResponse.status).toBe(200)
    const initiation = (await initiationResponse.json()) as {
      result: { structuredContent: Record<string, unknown> }
    }
    expect(initiation.result.structuredContent).toEqual({
      url: 'https://bank.example/authorize',
    })
    const firstCallback = await originalFetch(
      `http://127.0.0.1:${port}/banking/callback?code=mock-code&state=${authorizationState}`,
      { redirect: 'manual' },
    )
    expect(firstCallback.status).toBe(303)
    expect(firstCallback.headers.get('set-cookie')).toContain('SameSite=None')
    const duplicateCallback = await originalFetch(
      `http://127.0.0.1:${port}/banking/callback?code=mock-code&state=${authorizationState}`,
      { redirect: 'manual' },
    )
    expect(duplicateCallback.status).toBe(303)
    expect(duplicateCallback.headers.get('location')).toBe('/banking/select')
    expect(providerSessionCount).toBe(1)
    const firstCookie = firstCallback.headers.get('set-cookie')?.split(';')[0]
    expect(firstCookie).toMatch(/^hv_bank_selection=/)
    const selection = await originalFetch(`http://127.0.0.1:${port}/banking/select`, {
      headers: { Cookie: firstCookie as string },
    })
    expect(selection.headers.get('set-cookie')).toContain('SameSite=None')
    const page = await selection.text()
    expect(page).toContain('Mock account')
    expect(page).not.toContain('mock-account-uid')
    expect(page).not.toContain('mock-code')
    const accountId = /name="account" value="([0-9a-f-]+)"/.exec(page)?.[1]
    const selectionProof = /name="selection" value="([A-Za-z0-9._-]+)"/.exec(page)?.[1]
    const csrf = /name="csrf" value="([A-Za-z0-9_-]+)"/.exec(page)?.[1]
    expect(accountId).toBeDefined()
    expect(selectionProof).toBe(firstCookie?.split('=')[1])
    expect(csrf).toBeDefined()
    const rejectedSelection = await originalFetch(`http://127.0.0.1:${port}/banking/select`, {
      method: 'POST',
      headers: {
        Cookie: firstCookie as string,
        Origin: 'https://untrusted.example',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        account: accountId as string,
        selection: selectionProof as string,
        csrf: csrf as string,
      }),
    })
    expect(rejectedSelection.status).toBe(403)
    const rejectedWithoutToken = await originalFetch(`http://127.0.0.1:${port}/banking/select`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        account: accountId as string,
        selection: selectionProof as string,
      }),
    })
    expect(rejectedWithoutToken.status).toBe(403)
    const save = await originalFetch(`http://127.0.0.1:${port}/banking/select`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        account: accountId as string,
        selection: selectionProof as string,
        csrf: csrf as string,
      }),
    })
    expect(save.status).toBe(200)
    const db = createDb()
    const firstConnection = await db.query.bankConnection.findFirst({
      where: (table, { eq }) => eq(table.providerConnectionId, 'mock-session-1'),
    })
    expect(firstConnection?.status).toBe('connected')
    firstConnectionId = firstConnection?.id ?? ''

    const renewal = await startBankConsent({
      workspaceKind: 'personal',
      aspspName: 'Mock Bank',
      aspspCountry: 'SE',
      renew: true,
    })
    expect(renewal).toEqual({ url: 'https://bank.example/authorize' })
    const renewalCallback = await originalFetch(
      `http://127.0.0.1:${port}/banking/callback?code=mock-renewal-code&state=${authorizationState}`,
      { redirect: 'manual' },
    )
    expect(renewalCallback.status).toBe(303)
    const recoveryResponse = await originalFetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.BANK_CONSENT_MCP_TOKEN}`,
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'recover_bank_selection',
          arguments: { aspspName: 'Mock Bank', aspspCountry: 'SE' },
        },
      }),
    })
    expect(recoveryResponse.status).toBe(200)
    const recovery = (await recoveryResponse.json()) as {
      result: { structuredContent: { url: string } }
    }
    const recoveryUrl = new URL(recovery.result.structuredContent.url)
    expect(recoveryUrl.pathname).toBe('/banking/select')
    expect(recoveryUrl.searchParams.get('proof')).toMatch(
      /^[0-9a-f-]{36}\.\d{13}\.[A-Za-z0-9_-]{43}$/,
    )
    const renewalSelection = await originalFetch(recoveryUrl.toString())
    expect(renewalSelection.status).toBe(200)
    const renewalPage = await renewalSelection.text()
    expect(renewalPage).toContain('checked')
    const renewalAccountId = /name="account" value="([0-9a-f-]+)"/.exec(renewalPage)?.[1]
    const renewalProof = /name="selection" value="([A-Za-z0-9._-]+)"/.exec(renewalPage)?.[1]
    const renewalCsrf = /name="csrf" value="([A-Za-z0-9_-]+)"/.exec(renewalPage)?.[1]
    const renewalSave = await originalFetch(`http://127.0.0.1:${port}/banking/select`, {
      method: 'POST',
      headers: {
        Origin: 'null',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        account: renewalAccountId as string,
        selection: renewalProof as string,
        csrf: renewalCsrf as string,
      }),
    })
    expect(renewalSave.status).toBe(200)
    const oldConnection = await db.query.bankConnection.findFirst({
      where: (table, { eq }) => eq(table.id, firstConnectionId),
    })
    const newConnection = await db.query.bankConnection.findFirst({
      where: (table, { eq }) => eq(table.providerConnectionId, 'mock-session-2'),
    })
    expect(oldConnection?.status).toBe('disconnected')
    expect(newConnection?.status).toBe('connected')

    const business = await startBankConsent({
      workspaceKind: 'business',
      aspspName: 'Mock Bank',
      aspspCountry: 'SE',
      renew: false,
    })
    expect(business).toEqual({ url: 'https://bank.example/authorize' })
    const businessCallback = await originalFetch(
      `http://127.0.0.1:${port}/banking/callback?code=mock-business-code&state=${authorizationState}`,
    )
    expect(businessCallback.status).toBe(200)
    expect(await businessCallback.text()).toContain('Bank connected')
    const businessConnection = await db.query.bankConnection.findFirst({
      where: (table, { eq }) => eq(table.providerConnectionId, 'mock-session-3'),
    })
    expect(businessConnection?.status).toBe('connected')
    const businessAccounts = await db.query.bankAccount.findMany({
      where: (table, { eq }) => eq(table.connectionId, businessConnection?.id ?? ''),
    })
    expect(businessAccounts).toHaveLength(1)
    expect(businessAccounts[0].included).toBe(true)

    const replay = await originalFetch(
      `http://127.0.0.1:${port}/banking/callback?code=mock-renewal-code&state=${authorizationState}`,
    )
    expect(replay.status).toBe(400)
  })
})

async function reservePort() {
  const listener = createServer()
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve))
  const address = listener.address()
  if (!address || typeof address === 'string') {
    throw new Error('No local test port')
  }
  await new Promise<void>((resolve) => listener.close(() => resolve()))
  return address.port
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
