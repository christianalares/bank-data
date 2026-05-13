import { createHash, randomUUID, sign } from 'node:crypto'

import {
  attachment,
  bankAccount,
  bankConnection,
  bankTransaction,
  createDb,
} from '@bank-data/db'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { and, count, desc, eq } from 'drizzle-orm'

import { getOrCreateWorkspace, getServerSession } from '#/features/banking/shared'

type ImportCsvInput = {
  csv: string
  accountName?: string
  currency?: string
}

type StartEnableBankingAuthorizationInput = {
  aspspName: string
  aspspCountry?: string
  psuType?: 'personal' | 'business'
  authMethod?: string
}

type CompleteEnableBankingAuthorizationInput = {
  code: string
  state: string
}

type CsvRow = Record<string, string>

type NormalizedTransaction = {
  providerTransactionId: string
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

type UpdateTransactionNoteInput = {
  transactionId: string
  note: string | null
}

export const updateTransactionNote = createServerFn({ method: 'POST' })
  .inputValidator((input: UpdateTransactionNoteInput) => input)
  .handler(async ({ data }) => {
    const session = await getServerSession()
    const db = createDb()
    const ownerWorkspace = await getOrCreateWorkspace(session.user.id)

    const [updated] = await db
      .update(bankTransaction)
      .set({
        note: data.note,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bankTransaction.id, data.transactionId),
          eq(bankTransaction.workspaceId, ownerWorkspace.id),
        ),
      )
      .returning({ id: bankTransaction.id })

    if (!updated) {
      throw new Error('Transaction not found')
    }

    return { ok: true }
  })

export const getTransactions = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getServerSession()
  const db = createDb()
  const ownerWorkspace = await getOrCreateWorkspace(session.user.id)

  const [accounts, transactions, connections, attachmentCounts] = await Promise.all([
    db.query.bankAccount.findMany({
      where: (table, { eq }) => eq(table.workspaceId, ownerWorkspace.id),
      orderBy: (table) => [desc(table.updatedAt)],
    }),
    db.query.bankTransaction.findMany({
      where: (table, { eq }) => eq(table.workspaceId, ownerWorkspace.id),
      orderBy: (table) => [desc(table.bookedAt), desc(table.createdAt)],
      limit: 100,
    }),
    db.query.bankConnection.findMany({
      where: (table, { eq }) => eq(table.workspaceId, ownerWorkspace.id),
      orderBy: (table) => [desc(table.updatedAt)],
    }),
    db
      .select({ transactionId: attachment.transactionId, count: count() })
      .from(attachment)
      .where(and(eq(attachment.workspaceId, ownerWorkspace.id)))
      .groupBy(attachment.transactionId),
  ])

  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const attachmentCountById = new Map(
    attachmentCounts
      .filter((r) => r.transactionId !== null)
      .map((r) => [r.transactionId as string, r.count]),
  )
  const latestConnection = connections[0]

  return {
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
      currentBalance: account.currentBalance,
      availableBalance: account.availableBalance,
    })),
    transactions: transactions.map((transaction) => {
      const account = accountById.get(transaction.accountId)

      return {
        id: transaction.id,
        accountName: account?.name ?? 'Unknown account',
        bookedAt: transaction.bookedAt.toISOString(),
        amount: transaction.amount,
        currency: transaction.currency,
        description: transaction.description,
        merchantName: transaction.merchantName,
        counterpartyName: transaction.counterpartyName,
        balanceAfterTransaction: transaction.balanceAfterTransaction,
        status: transaction.status,
        provider: transaction.provider,
        note: transaction.note,
        attachmentCount: attachmentCountById.get(transaction.id) ?? 0,
      }
    }),
    stats: {
      transactionCount: transactions.length,
      accountCount: accounts.length,
      connectionStatus: latestConnection?.status ?? 'disconnected',
      lastSyncedAt: latestConnection?.lastSyncedAt?.toISOString() ?? null,
      errorMessage: latestConnection?.errorMessage ?? null,
    },
  }
})

export const importTransactionsCsv = createServerFn({ method: 'POST' })
  .inputValidator((input: ImportCsvInput) => input)
  .handler(async ({ data }) => {
    const session = await getServerSession()
    const db = createDb()
    const ownerWorkspace = await getOrCreateWorkspace(session.user.id)
    const rows = parseCsv(data.csv)
    const currency = normalizeCurrency(data.currency, ownerWorkspace.baseCurrency)
    const accountName = normalizeAccountName(data.accountName, rows)
    const providerAccountId = `csv:${slugify(accountName)}:${currency}`
    const now = new Date()

    if (rows.length === 0) {
      throw new Error('CSV import requires at least one transaction row')
    }

    const [connection] = await db
      .insert(bankConnection)
      .values({
        workspaceId: ownerWorkspace.id,
        provider: 'csv',
        providerConnectionId: 'manual-csv',
        name: 'CSV Import',
        status: 'connected',
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          bankConnection.workspaceId,
          bankConnection.provider,
          bankConnection.providerConnectionId,
        ],
        set: {
          status: 'connected',
          errorMessage: null,
          lastSyncedAt: now,
          updatedAt: now,
        },
      })
      .returning()

    const [account] = await db
      .insert(bankAccount)
      .values({
        workspaceId: ownerWorkspace.id,
        connectionId: connection.id,
        providerAccountId,
        name: accountName,
        currency,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [bankAccount.connectionId, bankAccount.providerAccountId],
        set: {
          name: accountName,
          currency,
          updatedAt: now,
        },
      })
      .returning()

    const normalizedTransactions = rows.map((row) =>
      normalizeCsvTransaction(row, {
        providerAccountId,
        currency,
      }),
    )

    for (const transaction of normalizedTransactions) {
      await db
        .insert(bankTransaction)
        .values({
          workspaceId: ownerWorkspace.id,
          connectionId: connection.id,
          accountId: account.id,
          provider: 'csv',
          providerTransactionId: transaction.providerTransactionId,
          internalId: createInternalId(
            'csv',
            ownerWorkspace.id,
            providerAccountId,
            transaction.providerTransactionId,
          ),
          status: 'booked',
          bookedAt: transaction.bookedAt,
          valueAt: transaction.bookedAt,
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
            accountId: account.id,
            connectionId: connection.id,
            bookedAt: transaction.bookedAt,
            valueAt: transaction.bookedAt,
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

    const latestBalance = getLatestBalance(normalizedTransactions)

    if (latestBalance) {
      await db
        .update(bankAccount)
        .set({
          currentBalance: latestBalance,
          availableBalance: latestBalance,
          updatedAt: now,
        })
        .where(and(eq(bankAccount.id, account.id), eq(bankAccount.workspaceId, ownerWorkspace.id)))
    }

    return {
      ok: true,
      imported: normalizedTransactions.length,
    }
  })

async function syncEnableBankingConnection({
  workspaceId,
  connectionId,
  accounts,
}: {
  workspaceId: string
  connectionId: string
  accounts: EnableBankingAccount[]
}) {
  const db = createDb()
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
      getEnableBankingAccountTransactions(accountUid),
    ])
    const accountDetails = {
      ...enableBankingAccount,
      ...details,
    }
    const balance = pickBalance(balances)
    const [account] = await db
      .insert(bankAccount)
      .values({
        workspaceId,
        connectionId,
        providerAccountId: accountUid,
        name: getEnableBankingAccountName(accountDetails),
        iban: accountDetails.account_id?.iban ?? null,
        currency: accountDetails.currency ?? balance?.currency ?? 'SEK',
        accountType: accountDetails.cash_account_type ?? null,
        currentBalance: balance?.amount ?? null,
        availableBalance: balance?.amount ?? null,
        rawMetadata: {
          details: accountDetails,
          balances,
        },
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
          rawMetadata: {
            details: accountDetails,
            balances,
          },
          updatedAt: now,
        },
      })
      .returning()

    for (const transaction of transactions.map((item) =>
      normalizeEnableBankingTransaction(item, {
        accountId: accountUid,
        fallbackCurrency: account.currency,
      }),
    )) {
      await db
        .insert(bankTransaction)
        .values({
          workspaceId,
          connectionId,
          accountId: account.id,
          provider: 'enable_banking',
          providerTransactionId: transaction.providerTransactionId,
          internalId: createInternalId(
            'enable_banking',
            workspaceId,
            accountUid,
            transaction.providerTransactionId,
          ),
          status: transaction.valueAt ? 'booked' : 'pending',
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
            accountId: account.id,
            connectionId,
            status: transaction.valueAt ? 'booked' : 'pending',
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

      syncedTransactions += 1
    }
  }

  await db
    .update(bankConnection)
    .set({
      status: 'connected',
      errorMessage: null,
      lastSyncedAt: now,
      updatedAt: now,
    })
    .where(eq(bankConnection.id, connectionId))

  return {
    syncedAccounts: accounts.length,
    syncedTransactions,
  }
}

export const startEnableBankingAuthorization = createServerFn({ method: 'POST' })
  .inputValidator((input: StartEnableBankingAuthorizationInput) => input)
  .handler(async ({ data }) => {
    const session = await getServerSession()
    const request = getRequest()
    const db = createDb()
    const ownerWorkspace = await getOrCreateWorkspace(session.user.id)
    const state = randomUUID()
    const redirectUrl = `${getEnableBankingRedirectOrigin(request.url)}/api/banking/enable-banking/callback`
    const now = new Date()
    const authMethod = data.authMethod?.trim()
    const body = {
      access: {
        valid_until: new Date(Date.now() + 89 * 24 * 60 * 60 * 1000).toISOString(),
      },
      aspsp: {
        name: data.aspspName.trim(),
        country: (data.aspspCountry?.trim() || 'SE').toUpperCase(),
      },
      state,
      redirect_url: redirectUrl,
      psu_type: data.psuType ?? 'business',
      ...(authMethod ? { auth_method: authMethod } : {}),
    }

    if (!body.aspsp.name) {
      throw new Error('Bank name is required')
    }

    await db.insert(bankConnection).values({
      workspaceId: ownerWorkspace.id,
      provider: 'enable_banking',
      providerConnectionId: `auth:${state}`,
      name: `Enable Banking ${body.aspsp.name}`,
      status: 'pending',
      rawMetadata: {
        aspsp: body.aspsp,
        psuType: body.psu_type,
        redirectUrl,
      },
      createdAt: now,
      updatedAt: now,
    })

    const response = await enableBankingRequest<{
      url: string
      authorization_id: string
      psu_id_hash?: string
    }>('/auth', {
      method: 'POST',
      body,
    })

    return {
      url: response.url,
    }
  })

export const completeEnableBankingAuthorization = createServerFn({ method: 'POST' })
  .inputValidator((input: CompleteEnableBankingAuthorizationInput) => input)
  .handler(async ({ data }) => {
    const session = await getServerSession()
    const db = createDb()
    const ownerWorkspace = await getOrCreateWorkspace(session.user.id)
    const pendingConnection = await db.query.bankConnection.findFirst({
      where: (table, { and, eq }) =>
        and(
          eq(table.workspaceId, ownerWorkspace.id),
          eq(table.provider, 'enable_banking'),
          eq(table.providerConnectionId, `auth:${data.state}`),
        ),
    })

    if (!pendingConnection) {
      throw new Error('Enable Banking authorization state was not found')
    }

    const response = await enableBankingRequest<{
      session_id: string
      accounts: EnableBankingAccount[]
      aspsp?: {
        name?: string
        country?: string
      }
      access?: {
        valid_until?: string
      }
    }>('/sessions', {
      method: 'POST',
      body: {
        code: data.code,
      },
    })

    const [connection] = await db
      .update(bankConnection)
      .set({
        providerConnectionId: response.session_id,
        name: `Enable Banking ${response.aspsp?.name ?? 'connection'}`,
        status: 'connected',
        errorMessage: null,
        rawMetadata: response,
        updatedAt: new Date(),
      })
      .where(eq(bankConnection.id, pendingConnection.id))
      .returning()

    const synced = await syncEnableBankingConnection({
      workspaceId: ownerWorkspace.id,
      connectionId: connection.id,
      accounts: response.accounts,
    })

    return {
      ok: true,
      ...synced,
    }
  })

async function getEnableBankingAccountDetails(accountId: string) {
  return enableBankingRequest<EnableBankingAccount>(
    `/accounts/${encodeURIComponent(accountId)}/details`,
  )
}

async function getEnableBankingAccountBalances(accountId: string) {
  const response = await enableBankingRequest<{
    balances?: EnableBankingBalance[]
  }>(`/accounts/${encodeURIComponent(accountId)}/balances`)

  return response.balances ?? []
}

async function getEnableBankingAccountTransactions(accountId: string) {
  const transactions: EnableBankingTransaction[] = []
  let continuationKey: string | undefined
  const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  do {
    const params = new URLSearchParams({
      date_from: dateFrom,
      strategy: 'default',
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
  options: {
    method?: 'GET' | 'POST'
    body?: unknown
  } = {},
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
  const header = {
    typ: 'JWT',
    alg: 'RS256',
    kid: applicationId,
  }
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

function getEnableBankingRedirectOrigin(requestUrl: string) {
  const configuredOrigin = process.env.ENABLE_BANKING_REDIRECT_ORIGIN?.replace(/\/$/, '')

  if (configuredOrigin) {
    return configuredOrigin
  }

  return new URL(requestUrl).origin
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

function pickBalance(balances: EnableBankingBalance[]) {
  const preferredBalance =
    balances.find((balance) => balance.balance_type === 'CLBD') ??
    balances.find((balance) => balance.balance_type === 'ITAV') ??
    balances[0]

  if (!preferredBalance?.balance_amount?.amount) {
    return null
  }

  const amount = parseAmount(preferredBalance.balance_amount.amount)

  if (!amount) {
    return null
  }

  return {
    amount,
    currency: preferredBalance.balance_amount.currency ?? 'SEK',
  }
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
  context: {
    accountId: string
    fallbackCurrency: string
  },
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

  const parsedAmount = Number(amount)

  if (indicator === 'DBIT' && parsedAmount > 0) {
    return (-parsedAmount).toFixed(2)
  }

  return parsedAmount.toFixed(2)
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

function parseCsv(csv: string) {
  const text = csv.trim()

  if (!text) {
    return []
  }

  const delimiter = detectDelimiter(text)
  const records = parseDelimitedText(text, delimiter)
  const [header, ...body] = records

  if (!header || body.length === 0) {
    return []
  }

  const normalizedHeader = header.map((column) => normalizeColumnName(column))

  return body
    .filter((record) => record.some((value) => value.trim()))
    .map((record) =>
      normalizedHeader.reduce<CsvRow>((row, column, index) => {
        if (column) {
          row[column] = record[index]?.trim() ?? ''
        }

        return row
      }, {}),
    )
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const candidates = [',', ';', '\t']

  return candidates.reduce((bestDelimiter, delimiter) => {
    const bestCount = firstLine.split(bestDelimiter).length
    const delimiterCount = firstLine.split(delimiter).length

    if (delimiterCount > bestCount) {
      return delimiter
    }

    return bestDelimiter
  }, ',')
}

function parseDelimitedText(text: string, delimiter: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const nextCharacter = text[index + 1]

    if (character === '"' && inQuotes && nextCharacter === '"') {
      field += '"'
      index += 1
      continue
    }

    if (character === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (character === delimiter && !inQuotes) {
      row.push(field)
      field = ''
      continue
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1
      }

      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }

    field += character
  }

  row.push(field)
  rows.push(row)

  return rows
}

function normalizeCsvTransaction(
  row: CsvRow,
  context: {
    providerAccountId: string
    currency: string
  },
): NormalizedTransaction {
  const date = getFirstValue(row, ['date', 'booked_at', 'booking_date', 'transaction_date'])
  const amount = parseAmount(getFirstValue(row, ['amount', 'sum', 'value', 'transaction_amount']))
  const currency = normalizeCurrency(
    getFirstValue(row, ['currency', 'currency_code']),
    context.currency,
  )
  const description =
    getFirstValue(row, ['description', 'name', 'text', 'message', 'merchant', 'counterparty']) ||
    'Imported transaction'
  const merchantName = getOptionalValue(row, ['merchant', 'merchant_name'])
  const counterpartyName = getOptionalValue(row, [
    'counterparty',
    'counterparty_name',
    'payee',
    'payer',
  ])
  const balanceAfterTransaction = parseOptionalAmount(
    getFirstValue(row, ['balance', 'balance_after_transaction', 'running_balance']),
  )

  if (!date) {
    throw new Error('CSV row is missing a date column')
  }

  if (!amount) {
    throw new Error('CSV row is missing an amount column')
  }

  return {
    providerTransactionId: getProviderTransactionId(row, {
      accountId: context.providerAccountId,
      date,
      amount,
      currency,
      description,
      balanceAfterTransaction,
    }),
    bookedAt: parseDate(date),
    valueAt: parseDate(date),
    amount,
    currency,
    description,
    merchantName,
    counterpartyName,
    balanceAfterTransaction,
    rawMetadata: row,
  }
}

function normalizeColumnName(column: string) {
  return column
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function normalizeAccountName(accountName: string | undefined, rows: CsvRow[]) {
  const rowAccountName = rows
    .map((row) => getFirstValue(row, ['account', 'account_name']))
    .find((value) => value)

  return accountName?.trim() || rowAccountName || 'CSV import'
}

function normalizeCurrency(value: string | undefined, fallback: string) {
  return (value?.trim() || fallback || 'SEK').toUpperCase()
}

function getFirstValue(row: CsvRow, columns: string[]) {
  for (const column of columns) {
    const value = row[column]?.trim()

    if (value) {
      return value
    }
  }

  return ''
}

function getOptionalValue(row: CsvRow, columns: string[]) {
  const value = getFirstValue(row, columns)

  if (value) {
    return value
  }

  return null
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
  const normalizedValue = normalizeAmount(value)

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

function normalizeAmount(value: string) {
  const trimmedValue = value.trim().replace(/\s/g, '')

  if (!trimmedValue) {
    return ''
  }

  if (trimmedValue.includes(',') && trimmedValue.includes('.')) {
    return trimmedValue.replace(/\./g, '').replace(',', '.')
  }

  return trimmedValue.replace(',', '.')
}

function getProviderTransactionId(
  row: CsvRow,
  fallback: {
    accountId: string
    date: string
    amount: string
    currency: string
    description: string
    balanceAfterTransaction: string | null
  },
) {
  const explicitId = getFirstValue(row, [
    'id',
    'transaction_id',
    'transactionid',
    'reference',
    'entry_reference',
  ])

  if (explicitId) {
    return explicitId
  }

  return stableHash([
    fallback.accountId,
    fallback.date,
    fallback.amount,
    fallback.currency,
    fallback.description,
    fallback.balanceAfterTransaction ?? '',
  ])
}

function createInternalId(
  provider: 'csv' | 'enable_banking',
  workspaceId: string,
  providerAccountId: string,
  providerTransactionId: string,
) {
  return `${provider}:${stableHash([workspaceId, providerAccountId, providerTransactionId])}`
}

function stableHash(parts: string[]) {
  return createHash('sha256').update(parts.join('\u001f')).digest('hex')
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  if (slug) {
    return slug
  }

  return 'account'
}

function getLatestBalance(transactions: NormalizedTransaction[]) {
  const latestTransactionWithBalance = transactions
    .filter((transaction) => transaction.balanceAfterTransaction)
    .sort((first, second) => second.bookedAt.getTime() - first.bookedAt.getTime())[0]

  return latestTransactionWithBalance?.balanceAfterTransaction ?? null
}
