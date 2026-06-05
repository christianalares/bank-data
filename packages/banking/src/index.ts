import { createHash, sign } from 'node:crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type EnableBankingAccount = {
  uid?: string
  identification_hash?: string
  account_id?: {
    iban?: string
    other?: {
      identification?: string
      scheme_name?: string
    }
  }
  name?: string
  details?: string
  currency?: string
  cash_account_type?: string
}

export type EnableBankingBalance = {
  balance_amount?: {
    currency?: string
    amount?: string
  }
  balance_type?: string
}

export type EnableBankingTransaction = {
  entry_reference?: string
  transaction_id?: string
  transaction_amount?: {
    currency?: string
    amount?: string
  }
  credit_debit_indicator?: 'CRDT' | 'DBIT'
  status?: 'BOOK' | 'PDNG'
  booking_date?: string
  value_date?: string
  transaction_date?: string
  balance_after_transaction?: {
    currency?: string
    amount?: string
  }
  remittance_information?: string[]
  note?: string
  reference_number?: string
  bank_transaction_code?: {
    description?: string
  }
  creditor?: {
    name?: string
  }
  debtor?: {
    name?: string
  }
}

export type NormalizedEnableBankingTransaction = {
  providerTransactionId: string
  status: 'booked' | 'pending'
  bookedAt: Date
  valueAt: Date | null
  amount: string
  currency: string
  description: string
  merchantName: string | null
  counterpartyName: string | null
  balanceAfterTransaction: string | null
  rawMetadata: unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// API client
// ─────────────────────────────────────────────────────────────────────────────

export async function enableBankingRequest<TResponse>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<TResponse> {
  const response = await fetch(`https://api.enablebanking.com${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${createEnableBankingJwt()}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    const responseText = await response.text()
    throw new Error(`Enable Banking request failed (${response.status}): ${responseText}`)
  }

  return response.json() as Promise<TResponse>
}

export async function getEnableBankingSessionAccounts(sessionId: string) {
  const response = await enableBankingRequest<{ accounts_data?: EnableBankingAccount[] }>(
    `/sessions/${encodeURIComponent(sessionId)}`,
  )
  return response.accounts_data ?? []
}

export async function getEnableBankingAccountDetails(accountId: string) {
  return enableBankingRequest<EnableBankingAccount>(
    `/accounts/${encodeURIComponent(accountId)}/details`,
  )
}

export async function getEnableBankingAccountBalances(accountId: string) {
  const response = await enableBankingRequest<{ balances?: EnableBankingBalance[] }>(
    `/accounts/${encodeURIComponent(accountId)}/balances`,
  )
  return response.balances ?? []
}

/**
 * Fetch settled transactions for an account.
 *
 * Only BOOK entries are returned: we both ask the API for `transaction_status=BOOK`
 * and drop any PDNG entries that slip through (some ASPSPs ignore the param).
 * Pending/reserved authorizations ("reserverat belopp") have an unreliable
 * credit/debit indicator and are transient duplicates of the BOOK entry that
 * settles later — keeping them out here is the single source of truth so neither
 * the cron sync nor the connect-time sync can reintroduce phantom transactions.
 */
export async function getEnableBankingTransactions(
  accountId: string,
  options: { dateFrom: string },
) {
  const transactions: EnableBankingTransaction[] = []
  let continuationKey: string | undefined

  do {
    const params = new URLSearchParams({
      date_from: options.dateFrom,
      strategy: 'default',
      transaction_status: 'BOOK',
    })

    if (continuationKey) {
      params.set('continuation_key', continuationKey)
    }

    const response = await enableBankingRequest<{
      transactions?: EnableBankingTransaction[]
      continuation_key?: string
    }>(`/accounts/${encodeURIComponent(accountId)}/transactions?${params.toString()}`)

    transactions.push(...(response.transactions ?? []))
    continuationKey = response.continuation_key
  } while (continuationKey)

  return transactions.filter((transaction) => transaction.status !== 'PDNG')
}

function createEnableBankingJwt() {
  const applicationId = process.env.ENABLE_BANKING_APPLICATION_ID
  const privateKeyBase64 = process.env.ENABLE_BANKING_PRIVATE_KEY_BASE64

  if (!applicationId) {
    throw new Error('ENABLE_BANKING_APPLICATION_ID is required')
  }

  if (!privateKeyBase64) {
    throw new Error('ENABLE_BANKING_PRIVATE_KEY_BASE64 is required')
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  const header = { typ: 'JWT', alg: 'RS256', kid: applicationId }
  const payload = {
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: nowSeconds,
    exp: nowSeconds + 5 * 60,
  }
  const unsignedToken = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`
  const signature = sign('RSA-SHA256', Buffer.from(unsignedToken), getEnableBankingPrivateKey())

  return `${unsignedToken}.${base64Url(signature)}`
}

function getEnableBankingPrivateKey() {
  const privateKeyBase64 = process.env.ENABLE_BANKING_PRIVATE_KEY_BASE64

  if (!privateKeyBase64) {
    throw new Error('ENABLE_BANKING_PRIVATE_KEY_BASE64 is required')
  }

  return Buffer.from(privateKeyBase64, 'base64').toString('utf8')
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────────────────

export function pickEnableBankingBalance(balances: EnableBankingBalance[]) {
  const preferredBalance =
    balances.find((b) => b.balance_type === 'CLBD') ??
    balances.find((b) => b.balance_type === 'ITAV') ??
    balances[0]

  if (!preferredBalance?.balance_amount?.amount) {
    return null
  }

  const amount = parseAmount(preferredBalance.balance_amount.amount)

  if (!amount) {
    return null
  }

  return { amount, currency: preferredBalance.balance_amount.currency ?? 'SEK' }
}

export function getEnableBankingAccountName(account: EnableBankingAccount) {
  return (
    account.name ||
    account.details ||
    account.account_id?.iban ||
    account.account_id?.other?.identification ||
    'Enable Banking account'
  )
}

export function createEnableBankingInternalId(
  workspaceId: string,
  providerAccountId: string,
  providerTransactionId: string,
) {
  return `enable_banking:${stableHash([workspaceId, providerAccountId, providerTransactionId])}`
}

export function normalizeEnableBankingTransaction(
  transaction: EnableBankingTransaction,
  context: { accountId: string; fallbackCurrency: string },
): NormalizedEnableBankingTransaction {
  const rawAmount = parseAmount(transaction.transaction_amount?.amount ?? '')
  const currency = transaction.transaction_amount?.currency ?? context.fallbackCurrency
  const bookedAt = parseDate(
    transaction.booking_date ?? transaction.value_date ?? transaction.transaction_date ?? '',
  )
  const valueAt = transaction.value_date ? parseDate(transaction.value_date) : null
  const description = getEnableBankingTransactionDescription(transaction)
  const signedAmount = normalizeEnableBankingAmount(rawAmount, transaction.credit_debit_indicator)
  const balanceAfterTransaction = parseOptionalAmount(
    transaction.balance_after_transaction?.amount ?? '',
  )

  if (!signedAmount) {
    throw new Error('Enable Banking transaction is missing an amount')
  }

  return {
    providerTransactionId: getEnableBankingTransactionId(transaction, {
      accountId: context.accountId,
      bookedAt: bookedAt.toISOString(),
      amount: signedAmount,
      currency,
      description,
      balanceAfterTransaction,
    }),
    status: transaction.status === 'PDNG' ? 'pending' : 'booked',
    bookedAt,
    valueAt,
    amount: signedAmount,
    currency,
    description,
    merchantName: transaction.creditor?.name ?? transaction.debtor?.name ?? null,
    counterpartyName: getEnableBankingCounterparty(transaction),
    balanceAfterTransaction,
    rawMetadata: transaction,
  }
}

function normalizeEnableBankingAmount(
  amount: string | null,
  indicator: 'CRDT' | 'DBIT' | undefined,
) {
  if (!amount) {
    return null
  }

  const magnitude = Math.abs(Number(amount))

  // Enable Banking reports positive magnitudes with a separate credit/debit
  // indicator. Treat anything that isn't an explicit credit as a debit (money
  // out) so a missing indicator can't masquerade as income.
  if (indicator === 'CRDT') {
    return magnitude.toFixed(2)
  }

  return (-magnitude).toFixed(2)
}

function getEnableBankingTransactionDescription(transaction: EnableBankingTransaction) {
  return (
    transaction.remittance_information?.filter(Boolean).join(' ') ||
    transaction.note ||
    transaction.reference_number ||
    transaction.bank_transaction_code?.description ||
    transaction.creditor?.name ||
    transaction.debtor?.name ||
    'Enable Banking transaction'
  )
}

function getEnableBankingCounterparty(transaction: EnableBankingTransaction) {
  if (transaction.credit_debit_indicator === 'CRDT') {
    return transaction.debtor?.name ?? transaction.creditor?.name ?? null
  }

  return transaction.creditor?.name ?? transaction.debtor?.name ?? null
}

function getEnableBankingTransactionId(
  transaction: EnableBankingTransaction,
  fallback: {
    accountId: string
    bookedAt: string
    amount: string
    currency: string
    description: string
    balanceAfterTransaction: string | null
  },
) {
  if (transaction.entry_reference) {
    return transaction.entry_reference
  }

  if (transaction.transaction_id) {
    return transaction.transaction_id
  }

  return stableHash([
    fallback.accountId,
    fallback.bookedAt,
    fallback.amount,
    fallback.currency,
    fallback.description,
    fallback.balanceAfterTransaction ?? '',
  ])
}

function parseDate(value: string) {
  const normalizedValue = value.trim()
  const swedishDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizedValue)
  const compactDate = /^(\d{8})$/.exec(normalizedValue)

  if (swedishDate) {
    return new Date(`${swedishDate[1]}-${swedishDate[2]}-${swedishDate[3]}T00:00:00`)
  }

  if (compactDate) {
    return new Date(
      `${compactDate[1].slice(0, 4)}-${compactDate[1].slice(4, 6)}-${compactDate[1].slice(6, 8)}T00:00:00`,
    )
  }

  const parsedDate = new Date(normalizedValue)

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`Invalid transaction date: ${value}`)
  }

  return parsedDate
}

function parseAmount(value: string) {
  const normalizedValue = value.trim().replace(/\s/g, '').replace(',', '.')

  if (!normalizedValue) {
    return null
  }

  const parsedAmount = Number(normalizedValue)

  if (!Number.isFinite(parsedAmount)) {
    throw new Error(`Invalid transaction amount: ${value}`)
  }

  return parsedAmount.toFixed(2)
}

function parseOptionalAmount(value: string) {
  if (!value) {
    return null
  }

  return parseAmount(value)
}

function stableHash(parts: string[]) {
  return createHash('sha256').update(parts.join('\u001f')).digest('hex')
}
