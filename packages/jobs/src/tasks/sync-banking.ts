import { createHash, sign } from 'node:crypto'

import {
  bankAccount,
  bankConnection,
  bankTransaction,
  createDb,
  type Database,
} from '@bank-data/db'
import { logger, schedules, schemaTask } from '@trigger.dev/sdk'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { matchPendingAttachmentsTask } from './match-pending-attachments'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

const syncBankingPayloadSchema = z.object({
  overlapDays: z.number().int().positive().optional().default(14),
})

export type SyncBankingPayload = z.infer<typeof syncBankingPayloadSchema>

type EnableBankingAccount = {
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

type EnableBankingBalance = {
  balance_amount?: {
    currency?: string
    amount?: string
  }
  balance_type?: string
}

type EnableBankingTransaction = {
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

type NormalizedTransaction = {
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
// Tasks
// ─────────────────────────────────────────────────────────────────────────────

export const syncBankingTask = schemaTask({
  id: 'sync-banking',
  schema: syncBankingPayloadSchema,
  run: async (payload) => {
    const db = createDb()
    const overlapDays = payload.overlapDays
    const connections = await db.query.bankConnection.findMany({
      where: (table, { and, eq }) =>
        and(eq(table.provider, 'enable_banking'), eq(table.status, 'connected')),
    })

    if (connections.length === 0) {
      logger.info('No connected Enable Banking connections found; nothing to sync.')
    }

    let syncedAccounts = 0
    let syncedTransactions = 0

    for (const connection of connections) {
      try {
        const result = await syncEnableBankingConnection({ db, connection, overlapDays })
        syncedAccounts += result.syncedAccounts
        syncedTransactions += result.syncedTransactions
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : 'Enable Banking sync failed'

        logger.error('Failed to sync connection', { connectionId: connection.id, message })

        await db
          .update(bankConnection)
          .set({ status: 'error', errorMessage: message, updatedAt: new Date() })
          .where(eq(bankConnection.id, connection.id))
      }
    }

    const workspaceIds = [...new Set(connections.map((c) => c.workspaceId))]
    await Promise.all(
      workspaceIds.map((workspaceId) => matchPendingAttachmentsTask.trigger({ workspaceId })),
    )

    return { syncedConnections: connections.length, syncedAccounts, syncedTransactions }
  },
})

// Daily sync at 3am — adjust the cron pattern in your Trigger.dev dashboard if needed
export const scheduledSyncBankingTask = schedules.task({
  id: 'scheduled-sync-banking',
  cron: {
    pattern: '0 3 * * *',
    timezone: 'Europe/Stockholm',
  },
  run: async () => {
    logger.info('Starting scheduled banking sync')
    await syncBankingTask.triggerAndWait({ overlapDays: 14 })
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Sync logic
// ─────────────────────────────────────────────────────────────────────────────

async function syncEnableBankingConnection({
  db,
  connection,
  overlapDays,
}: {
  db: Database
  connection: typeof bankConnection.$inferSelect
  overlapDays: number
}) {
  const localAccounts = await db.query.bankAccount.findMany({
    where: (table, { eq }) => eq(table.connectionId, connection.id),
  })
  const accounts: EnableBankingAccount[] =
    localAccounts.length > 0
      ? localAccounts.map((account) => ({
          uid: account.providerAccountId,
          name: account.name,
          currency: account.currency,
          cash_account_type: account.accountType ?? undefined,
          account_id: { iban: account.iban ?? undefined },
        }))
      : await getSessionAccounts(connection.providerConnectionId)

  const now = new Date()
  let syncedTransactions = 0

  for (const enableBankingAccount of accounts) {
    const accountUid = enableBankingAccount.uid ?? enableBankingAccount.identification_hash

    if (!accountUid) {
      continue
    }

    const [details, balances, transactions] = await Promise.all([
      getEnableBankingAccountDetails(accountUid).catch(() => enableBankingAccount),
      getEnableBankingAccountBalances(accountUid).catch(() => []),
      getEnableBankingAccountTransactions(accountUid, {
        dateFrom: getDateFrom(connection.lastSyncedAt, overlapDays),
      }),
    ])

    const accountDetails = { ...enableBankingAccount, ...details }
    const balance = pickBalance(balances)

    const [account] = await db
      .insert(bankAccount)
      .values({
        workspaceId: connection.workspaceId,
        connectionId: connection.id,
        providerAccountId: accountUid,
        name: getEnableBankingAccountName(accountDetails),
        iban: accountDetails.account_id?.iban ?? null,
        currency: accountDetails.currency ?? balance?.currency ?? 'SEK',
        accountType: accountDetails.cash_account_type ?? null,
        currentBalance: balance?.amount ?? null,
        availableBalance: balance?.amount ?? null,
        rawMetadata: { details: accountDetails, balances },
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [bankAccount.connectionId, bankAccount.providerAccountId],
        set: {
          name: getEnableBankingAccountName(accountDetails),
          iban: accountDetails.account_id?.iban ?? null,
          currency: accountDetails.currency ?? balance?.currency ?? 'SEK',
          accountType: accountDetails.cash_account_type ?? null,
          currentBalance: balance?.amount ?? null,
          availableBalance: balance?.amount ?? null,
          rawMetadata: { details: accountDetails, balances },
          updatedAt: now,
        },
      })
      .returning()

    // Belt-and-suspenders: some ASPSPs return pending entries even when we ask
    // for BOOK only. Drop them so reserved authorizations are never stored.
    const bookedTransactions = transactions.filter((item) => item.status !== 'PDNG')

    for (const transaction of bookedTransactions.map((item) =>
      normalizeEnableBankingTransaction(item, {
        accountId: accountUid,
        fallbackCurrency: account.currency,
      }),
    )) {
      await upsertBankTransaction({
        db,
        workspaceId: connection.workspaceId,
        connectionId: connection.id,
        accountId: account.id,
        providerAccountId: accountUid,
        transaction,
        now,
      })

      syncedTransactions += 1
    }
  }

  await db
    .update(bankConnection)
    .set({ status: 'connected', errorMessage: null, lastSyncedAt: now, updatedAt: now })
    .where(eq(bankConnection.id, connection.id))

  return { syncedAccounts: accounts.length, syncedTransactions }
}

async function upsertBankTransaction({
  db,
  workspaceId,
  connectionId,
  accountId,
  providerAccountId,
  transaction,
  now,
}: {
  db: Database
  workspaceId: string
  connectionId: string
  accountId: string
  providerAccountId: string
  transaction: NormalizedTransaction
  now: Date
}) {
  await db
    .insert(bankTransaction)
    .values({
      workspaceId,
      connectionId,
      accountId,
      provider: 'enable_banking',
      providerTransactionId: transaction.providerTransactionId,
      internalId: createInternalId(
        workspaceId,
        providerAccountId,
        transaction.providerTransactionId,
      ),
      status: transaction.status,
      bookedAt: transaction.bookedAt,
      valueAt: transaction.valueAt,
      amount: transaction.amount,
      currency: transaction.currency,
      description: transaction.description,
      merchantName: transaction.merchantName,
      counterpartyName: transaction.counterpartyName,
      balanceAfterTransaction: transaction.balanceAfterTransaction,
      rawMetadata: transaction.rawMetadata,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: bankTransaction.internalId,
      set: {
        accountId,
        connectionId,
        status: transaction.status,
        bookedAt: transaction.bookedAt,
        valueAt: transaction.valueAt,
        amount: transaction.amount,
        currency: transaction.currency,
        description: transaction.description,
        merchantName: transaction.merchantName,
        counterpartyName: transaction.counterpartyName,
        balanceAfterTransaction: transaction.balanceAfterTransaction,
        rawMetadata: transaction.rawMetadata,
        updatedAt: now,
      },
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Enable Banking API helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getSessionAccounts(sessionId: string) {
  const response = await enableBankingRequest<{ accounts_data?: EnableBankingAccount[] }>(
    `/sessions/${encodeURIComponent(sessionId)}`,
  )
  return response.accounts_data ?? []
}

async function getEnableBankingAccountDetails(accountId: string) {
  return enableBankingRequest<EnableBankingAccount>(
    `/accounts/${encodeURIComponent(accountId)}/details`,
  )
}

async function getEnableBankingAccountBalances(accountId: string) {
  const response = await enableBankingRequest<{ balances?: EnableBankingBalance[] }>(
    `/accounts/${encodeURIComponent(accountId)}/balances`,
  )
  return response.balances ?? []
}

async function getEnableBankingAccountTransactions(
  accountId: string,
  options: { dateFrom: string },
) {
  const transactions: EnableBankingTransaction[] = []
  let continuationKey: string | undefined

  do {
    const params = new URLSearchParams({
      date_from: options.dateFrom,
      strategy: 'default',
      // Only settled transactions. Pending/reserved authorizations have an
      // unreliable sign and are transient duplicates of the BOOK entry that
      // settles later.
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

  return transactions
}

async function enableBankingRequest<TResponse>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
) {
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
// Data normalization helpers
// ─────────────────────────────────────────────────────────────────────────────

function getDateFrom(lastSyncedAt: Date | null, overlapDays: number) {
  const fallbackDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  if (!lastSyncedAt) {
    return fallbackDate.toISOString().slice(0, 10)
  }

  const overlapDate = new Date(lastSyncedAt)
  overlapDate.setDate(overlapDate.getDate() - overlapDays)

  return overlapDate.toISOString().slice(0, 10)
}

function pickBalance(balances: EnableBankingBalance[]) {
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

function getEnableBankingAccountName(account: EnableBankingAccount) {
  return (
    account.name ||
    account.details ||
    account.account_id?.iban ||
    account.account_id?.other?.identification ||
    'Enable Banking account'
  )
}

function normalizeEnableBankingTransaction(
  transaction: EnableBankingTransaction,
  context: { accountId: string; fallbackCurrency: string },
): NormalizedTransaction {
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
  const parsedDate = new Date(value)

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

function createInternalId(
  workspaceId: string,
  providerAccountId: string,
  providerTransactionId: string,
) {
  return `enable_banking:${stableHash([workspaceId, providerAccountId, providerTransactionId])}`
}

function stableHash(parts: string[]) {
  return createHash('sha256').update(parts.join('\u001f')).digest('hex')
}
