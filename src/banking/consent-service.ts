import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import {
  bankAccount,
  bankConnection,
  createDb,
  decryptPersonalAccountPayload,
  encryptPersonalAccountPayload,
  encryptPersonalProviderPayload,
} from '#db'
import {
  ENABLE_BANKING_NO_ACCOUNTS_ERROR,
  type EnableBankingAccount,
  enableBankingRequest,
  getEnableBankingAccountBalances,
  getEnableBankingAccountDetails,
  getEnableBankingAccountName,
  getEnableBankingSessionAccounts,
  pickEnableBankingBalance,
} from './index'

export type ConsentWorkspaceKind = 'personal' | 'business'

export type StartBankConsentInput = {
  workspaceKind: ConsentWorkspaceKind
  aspspName: string
  aspspCountry: string
  authMethod?: string
  renew: boolean
}

const PENDING_LIFETIME_MS = 15 * 60 * 1000
const SELECTION_LIFETIME_MS = 15 * 60 * 1000

type ConsentMetadata = {
  flow: 'mcp-consent'
  aspsp: { name: string; country: string }
  workspaceKind: ConsentWorkspaceKind
  authorizationStateHash?: string
  callbackCodeHash?: string
  renewConnectionId?: string
  selectionCompleteAt?: string
}

export function getConsentToken() {
  const token = process.env.BANK_CONSENT_MCP_TOKEN?.trim()
  if (!token || token.length < 32 || token === process.env.MCP_API_TOKEN?.trim()) {
    throw new Error('A distinct BANK_CONSENT_MCP_TOKEN of at least 32 characters is required')
  }
  return token
}

function getConsentCookieSecret() {
  const secret = process.env.BANK_CONSENT_COOKIE_SECRET?.trim()
  if (
    !secret ||
    secret.length < 32 ||
    secret === process.env.BANK_CONSENT_MCP_TOKEN?.trim() ||
    secret === process.env.MCP_API_TOKEN?.trim()
  ) {
    throw new Error('A distinct BANK_CONSENT_COOKIE_SECRET of at least 32 characters is required')
  }
  return secret
}

function hashAuthorizationState(state: string) {
  return createHmac('sha256', getConsentCookieSecret())
    .update(`authorization-state:${state}`)
    .digest('base64url')
}

function hashCallbackCode(code: string) {
  return createHmac('sha256', getConsentCookieSecret())
    .update(`callback-code:${code}`)
    .digest('base64url')
}

export function getConsentRedirectUrl() {
  const origin = process.env.BANK_CONSENT_REDIRECT_ORIGIN?.trim()
  if (!origin) {
    throw new Error('BANK_CONSENT_REDIRECT_ORIGIN is required')
  }
  const parsed = new URL(origin)
  if (
    parsed.protocol !== 'https:' &&
    !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))
  ) {
    throw new Error('Bank consent redirect origin must use HTTPS')
  }
  if (
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error('Bank consent redirect origin must be an origin')
  }
  return new URL('/banking/callback', parsed).toString()
}

function getWorkspaceId(kind: ConsentWorkspaceKind) {
  const value =
    process.env[
      kind === 'personal'
        ? 'BANK_CONSENT_PERSONAL_WORKSPACE_ID'
        : 'BANK_CONSENT_BUSINESS_WORKSPACE_ID'
    ]?.trim()
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Configured ${kind} consent workspace is missing or invalid`)
  }
  return value
}

export async function startBankConsent(input: StartBankConsentInput) {
  const db = createDb()
  const workspaceId = getWorkspaceId(input.workspaceKind)
  const ownerWorkspace = await db.query.workspace.findFirst({
    where: (table, { and, eq }) =>
      and(eq(table.id, workspaceId), eq(table.kind, input.workspaceKind)),
    columns: { id: true },
  })
  if (!ownerWorkspace) {
    throw new Error('Configured consent workspace was not found')
  }

  const name = input.aspspName.trim()
  const country = input.aspspCountry.trim().toUpperCase()
  if (!name || !/^[A-Z]{2}$/.test(country)) {
    throw new Error('A bank name and two-letter country are required')
  }

  let renewConnectionId: string | undefined
  if (input.renew) {
    const connections = await db.query.bankConnection.findMany({
      where: (table, { and, eq }) =>
        and(
          eq(table.workspaceId, workspaceId),
          eq(table.provider, 'enable_banking'),
          eq(table.status, 'connected'),
        ),
      orderBy: (table) => [desc(table.createdAt)],
    })
    const matches = connections.filter((connection) => {
      const metadata = connection.rawMetadata as Partial<ConsentMetadata> | null
      return metadata?.aspsp?.name === name && metadata.aspsp.country === country
    })
    if (matches.length !== 1) {
      throw new Error('Renewal requires exactly one connected consent for this bank and workspace')
    }
    renewConnectionId = matches[0].id
  }

  const state = randomBytes(32).toString('base64url')
  const redirectUrl = getConsentRedirectUrl()
  let authorization: { url?: string }
  try {
    authorization = await enableBankingRequest<{ url?: string }>('/auth', {
      method: 'POST',
      body: {
        access: {
          balances: true,
          transactions: true,
          valid_until: new Date(
            Date.now() + (input.workspaceKind === 'personal' ? 179 : 89) * 86_400_000,
          ).toISOString(),
        },
        aspsp: { name, country },
        state,
        redirect_url: redirectUrl,
        psu_type: input.workspaceKind,
        ...(input.authMethod?.trim() ? { auth_method: input.authMethod.trim() } : {}),
      },
    })
  } catch {
    throw new Error('Bank authorization could not be started')
  }
  if (!authorization.url || new URL(authorization.url).protocol !== 'https:') {
    throw new Error('Bank authorization did not return a secure URL')
  }

  await db.insert(bankConnection).values({
    workspaceId,
    provider: 'enable_banking',
    providerConnectionId: `auth:${state}`,
    name: `Enable Banking ${name}`,
    status: 'pending',
    rawMetadata: {
      flow: 'mcp-consent',
      aspsp: { name, country },
      workspaceKind: input.workspaceKind,
      authorizationStateHash: hashAuthorizationState(state),
      ...(renewConnectionId ? { renewConnectionId } : {}),
    } satisfies ConsentMetadata,
  })

  return { url: authorization.url }
}

export async function completeBankConsent(code: string, state: string) {
  if (!code || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    throw new Error('Invalid bank callback')
  }
  const db = createDb()
  const pending = await db.query.bankConnection.findFirst({
    where: (table, { and, eq }) =>
      and(
        eq(table.provider, 'enable_banking'),
        eq(table.providerConnectionId, `auth:${state}`),
        eq(table.status, 'pending'),
      ),
  })
  const metadata = pending?.rawMetadata as ConsentMetadata | null
  if (
    !pending ||
    metadata?.flow !== 'mcp-consent' ||
    Date.now() - pending.createdAt.getTime() > PENDING_LIFETIME_MS
  ) {
    const completed = await findCompletedBankConsent(state, code)
    if (completed) {
      return completed
    }
    throw new Error('Bank authorization has expired or was already completed')
  }

  let session: {
    session_id: string
    accounts?: EnableBankingAccount[]
    aspsp?: { name?: string; country?: string }
    access?: { valid_until?: string }
  }
  try {
    session = await enableBankingRequest('/sessions', { method: 'POST', body: { code } })
  } catch {
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      const completed = await findCompletedBankConsent(state, code)
      if (completed) {
        return completed
      }
    }
    throw new Error('Bank authorization could not be completed')
  }
  if (!session.session_id) {
    throw new Error('Bank authorization returned no session')
  }
  const accounts = session.accounts?.length
    ? session.accounts
    : await getEnableBankingSessionAccounts(session.session_id)
  if (accounts.length === 0) {
    await db
      .update(bankConnection)
      .set({
        providerConnectionId: session.session_id,
        status: 'error',
        errorMessage: ENABLE_BANKING_NO_ACCOUNTS_ERROR,
        updatedAt: new Date(),
      })
      .where(eq(bankConnection.id, pending.id))
    throw new Error('Bank authorized the session but returned no accounts')
  }

  const kind = metadata.workspaceKind
  const previousAccounts = metadata.renewConnectionId
    ? await db.query.bankAccount.findMany({
        where: (table, { eq }) => eq(table.connectionId, metadata.renewConnectionId as string),
      })
    : []
  const now = new Date()
  for (const item of accounts) {
    const uid = item.uid ?? item.identification_hash
    if (!uid) {
      continue
    }
    const [details, balances] = await Promise.all([
      getEnableBankingAccountDetails(uid).catch(() => item),
      getEnableBankingAccountBalances(uid).catch(() => []),
    ])
    const account = { ...item, ...details }
    const balance = pickEnableBankingBalance(balances)
    const previous = previousAccounts.find((row) => row.providerAccountId === uid)
    const previousPayload = previous?.encryptedPersonalPayload
      ? decryptPersonalAccountPayload(previous.encryptedPersonalPayload)
      : null
    const personalPayload =
      kind === 'personal'
        ? {
            name: getEnableBankingAccountName(account),
            nameOverride: previousPayload?.nameOverride ?? null,
            iban: account.account_id?.iban ?? null,
            accountType: account.cash_account_type ?? null,
            rawMetadata: { details: account, balances },
          }
        : null
    await db
      .insert(bankAccount)
      .values({
        workspaceId: pending.workspaceId,
        connectionId: pending.id,
        providerAccountId: uid,
        name: personalPayload ? 'Encrypted personal account' : getEnableBankingAccountName(account),
        iban: personalPayload ? null : (account.account_id?.iban ?? null),
        currency: account.currency ?? balance?.currency ?? 'SEK',
        accountType: personalPayload ? null : (account.cash_account_type ?? null),
        currentBalance: balance?.amount ?? null,
        availableBalance: balance?.amount ?? null,
        rawMetadata: personalPayload ? null : { details: account, balances },
        encryptedPersonalPayload: personalPayload
          ? encryptPersonalAccountPayload(personalPayload)
          : null,
        included: kind === 'business' || (previous?.included ?? false),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [bankAccount.connectionId, bankAccount.providerAccountId],
        set: { updatedAt: now },
      })
  }

  const storedAccounts = await db.query.bankAccount.findMany({
    where: (table, { eq }) => eq(table.connectionId, pending.id),
  })
  if (storedAccounts.length === 0) {
    throw new Error('Bank returned no usable accounts')
  }

  await db
    .update(bankConnection)
    .set({
      providerConnectionId: session.session_id,
      name: `Enable Banking ${session.aspsp?.name ?? metadata.aspsp.name}`,
      rawMetadata: {
        ...metadata,
        callbackCodeHash: hashCallbackCode(code),
        aspsp: {
          name: session.aspsp?.name ?? metadata.aspsp.name,
          country: session.aspsp?.country ?? metadata.aspsp.country,
        },
      } satisfies ConsentMetadata,
      encryptedPersonalPayload:
        kind === 'personal' ? encryptPersonalProviderPayload(session) : null,
      consentValidUntil: session.access?.valid_until ? new Date(session.access.valid_until) : null,
      updatedAt: now,
    })
    .where(and(eq(bankConnection.id, pending.id), eq(bankConnection.status, 'pending')))

  if (kind === 'business') {
    await activateBankConsent(
      pending.id,
      storedAccounts.map((account) => account.id),
    )
  }
  return { connectionId: pending.id, needsSelection: kind === 'personal' }
}

async function findCompletedBankConsent(state: string, code: string) {
  const stateHash = hashAuthorizationState(state)
  const codeHash = hashCallbackCode(code)
  const db = createDb()
  const connections = await db.query.bankConnection.findMany({
    where: (table, { eq }) =>
      and(
        eq(table.provider, 'enable_banking'),
        sql`${table.rawMetadata}->>'authorizationStateHash' = ${stateHash}`,
      ),
  })
  for (const connection of connections) {
    const metadata = connection.rawMetadata as ConsentMetadata | null
    if (
      metadata?.flow !== 'mcp-consent' ||
      metadata.callbackCodeHash !== codeHash ||
      connection.providerConnectionId.startsWith('auth:') ||
      !['pending', 'connected'].includes(connection.status) ||
      Date.now() - connection.updatedAt.getTime() > PENDING_LIFETIME_MS
    ) {
      continue
    }
    const accounts = await db.query.bankAccount.findMany({
      where: (table, { eq }) => eq(table.connectionId, connection.id),
      columns: { id: true },
      limit: 1,
    })
    if (accounts.length > 0) {
      return {
        connectionId: connection.id,
        needsSelection: connection.status === 'pending' && metadata.workspaceKind === 'personal',
      }
    }
  }
  return null
}

export async function getBankSelection(connectionId: string) {
  const db = createDb()
  const connection = await db.query.bankConnection.findFirst({
    where: (table, { and, eq }) => and(eq(table.id, connectionId), eq(table.status, 'pending')),
  })
  const metadata = connection?.rawMetadata as ConsentMetadata | null
  if (!connection || metadata?.flow !== 'mcp-consent' || metadata.workspaceKind !== 'personal') {
    throw new Error('Account selection is no longer available')
  }
  const accounts = await db.query.bankAccount.findMany({
    where: (table, { eq }) => eq(table.connectionId, connectionId),
  })
  return accounts.map((account) => ({
    id: account.id,
    name: account.encryptedPersonalPayload
      ? decryptPersonalAccountPayload(account.encryptedPersonalPayload).name
      : account.name,
    currency: account.currency,
    included: account.included,
  }))
}

export async function activateBankConsent(connectionId: string, selectedAccountIds: string[]) {
  const db = createDb()
  const connection = await db.query.bankConnection.findFirst({
    where: (table, { and, eq }) => and(eq(table.id, connectionId), eq(table.status, 'pending')),
  })
  const metadata = connection?.rawMetadata as ConsentMetadata | null
  if (!connection || metadata?.flow !== 'mcp-consent') {
    throw new Error('Bank connection is no longer pending')
  }
  const accounts = await db.query.bankAccount.findMany({
    where: (table, { eq }) => eq(table.connectionId, connectionId),
  })
  const selected = new Set(selectedAccountIds)
  if (
    selected.size === 0 ||
    selected.size !== selectedAccountIds.length ||
    [...selected].some((id) => !accounts.some((account) => account.id === id))
  ) {
    throw new Error('Select at least one account from this connection')
  }
  const selectedProviderIds = accounts
    .filter((account) => selected.has(account.id))
    .map((account) => account.providerAccountId)

  await db.transaction(async (tx) => {
    await tx
      .update(bankAccount)
      .set({ included: false, updatedAt: new Date() })
      .where(eq(bankAccount.connectionId, connectionId))
    await tx
      .update(bankAccount)
      .set({ included: true, updatedAt: new Date() })
      .where(
        and(eq(bankAccount.connectionId, connectionId), inArray(bankAccount.id, [...selected])),
      )
    if (metadata.workspaceKind === 'personal') {
      await tx
        .update(bankAccount)
        .set({ included: false, updatedAt: new Date() })
        .where(
          and(
            eq(bankAccount.workspaceId, connection.workspaceId),
            ne(bankAccount.connectionId, connectionId),
            inArray(bankAccount.providerAccountId, selectedProviderIds),
          ),
        )
    }
    const [activated] = await tx
      .update(bankConnection)
      .set({
        status: 'connected',
        errorMessage: null,
        rawMetadata: { ...metadata, selectionCompleteAt: new Date().toISOString() },
        updatedAt: new Date(),
      })
      .where(and(eq(bankConnection.id, connectionId), eq(bankConnection.status, 'pending')))
      .returning({ id: bankConnection.id })
    if (!activated) {
      throw new Error('Bank connection was already activated')
    }
    if (metadata.renewConnectionId) {
      await tx
        .update(bankConnection)
        .set({
          status: 'disconnected',
          disconnectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(bankConnection.id, metadata.renewConnectionId),
            eq(bankConnection.workspaceId, connection.workspaceId),
            eq(bankConnection.status, 'connected'),
          ),
        )
    }
  })
}

export function makeSelectionCookie(connectionId: string, now = Date.now()) {
  const expiresAt = now + SELECTION_LIFETIME_MS
  const payload = `${connectionId}.${expiresAt}`
  const signature = createHmac('sha256', getConsentCookieSecret())
    .update(`selection:${payload}`)
    .digest('base64url')
  return `${payload}.${signature}`
}

export function readSelectionCookie(value: string | undefined, now = Date.now()) {
  if (!value) {
    return null
  }
  const match = /^([0-9a-f-]{36})\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(value)
  if (!match || Number(match[2]) < now) {
    return null
  }
  const payload = `${match[1]}.${match[2]}`
  const expected = createHmac('sha256', getConsentCookieSecret())
    .update(`selection:${payload}`)
    .digest()
  const received = Buffer.from(match[3], 'base64url')
  return received.length === expected.length && timingSafeEqual(received, expected)
    ? match[1]
    : null
}

export function makeSelectionFormToken(selectionCookie: string) {
  return createHmac('sha256', getConsentCookieSecret())
    .update(`selection-form:${selectionCookie}`)
    .digest('base64url')
}

export function hasValidSelectionFormToken(selectionCookie: string, suppliedToken: string | null) {
  if (!suppliedToken || !/^[A-Za-z0-9_-]{43}$/.test(suppliedToken)) {
    return false
  }
  const expected = Buffer.from(makeSelectionFormToken(selectionCookie), 'base64url')
  const received = Buffer.from(suppliedToken, 'base64url')
  return received.length === expected.length && timingSafeEqual(received, expected)
}

export async function getBankConsentStatus() {
  const db = createDb()
  const result = [] as Array<{
    workspaceKind: ConsentWorkspaceKind
    connected: number
    pending: number
    error: number
    expiringWithin14Days: number
  }>
  for (const kind of ['personal', 'business'] as const) {
    const workspaceId = getWorkspaceId(kind)
    const connections = await db.query.bankConnection.findMany({
      where: (table, { and, eq, ne }) =>
        and(
          eq(table.workspaceId, workspaceId),
          eq(table.provider, 'enable_banking'),
          ne(table.status, 'disconnected'),
        ),
    })
    result.push({
      workspaceKind: kind,
      connected: connections.filter((item) => item.status === 'connected').length,
      pending: connections.filter((item) => item.status === 'pending').length,
      error: connections.filter((item) => item.status === 'error').length,
      expiringWithin14Days: connections.filter(
        (item) =>
          item.status === 'connected' &&
          item.consentValidUntil &&
          item.consentValidUntil.getTime() < Date.now() + 14 * 86_400_000,
      ).length,
    })
  }
  return { workspaces: result }
}
