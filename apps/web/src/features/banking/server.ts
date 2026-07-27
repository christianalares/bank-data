import { createHash, randomBytes, randomUUID } from 'node:crypto'

import {
  createEnableBankingInternalId,
  type EnableBankingAccount,
  enableBankingRequest,
  getEnableBankingAccountBalances,
  getEnableBankingAccountDetails,
  getEnableBankingAccountName,
  getEnableBankingAspsps,
  getEnableBankingTransactions,
  normalizeEnableBankingTransaction,
  pickEnableBankingBalance,
  searchPersonalTransactionVectors,
  upsertPersonalTransactionVector,
} from '@hidden-village/banking'
import {
  attachment,
  bankAccount,
  bankConnection,
  bankTransaction,
  createDb,
  createPersonalSearchToken,
  decryptPersonalAccountPayload,
  decryptPersonalTransactionPayload,
  encryptPersonalAccountPayload,
  encryptPersonalProviderPayload,
  encryptPersonalTransactionPayload,
  personalMcpToken,
  personalTransactionSearchToken,
  tokenizePersonalSearchText,
} from '@hidden-village/db'
import type { syncBankingTask } from '@hidden-village/jobs'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { tasks } from '@trigger.dev/sdk'
import { and, count, desc, eq, gte, inArray, lte } from 'drizzle-orm'

import { getOrCreateWorkspace, type WorkspaceKind } from '#/features/banking/shared'
import { authMiddleware } from '#/lib/middleware'

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
  workspaceKind?: WorkspaceKind
}

type CompleteEnableBankingAuthorizationInput = {
  code: string
  state: string
}

type CsvRow = Record<string, string>

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

type UpdateTransactionNoteInput = {
  transactionId: string
  note: string | null
  workspaceKind?: WorkspaceKind
  merchantOverride?: string | null
}

type SetPersonalAccountIncludedInput = {
  accountId: string
  included: boolean
}

type BankProvidersInput = {
  country?: string
}

type DisconnectBankConnectionInput = {
  connectionId: string
}

type PersonalTransactionsInput = {
  query?: string
  accountId?: string
  dateFrom?: string
  dateTo?: string
  limit?: number
}

type CreatePersonalMcpTokenInput = {
  name: string
}

type RevokePersonalMcpTokenInput = {
  tokenId: string
}

type ReviewPersonalTransferInput = {
  transactionId: string
  action: 'confirm' | 'dismiss'
}

export const updateTransactionNote = createServerFn({ method: 'POST' })
  .inputValidator((input: UpdateTransactionNoteInput) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = createDb()
    const workspaceKind = data.workspaceKind ?? 'business'
    const ownerWorkspace = await getOrCreateWorkspace(context.session.user.id, workspaceKind)
    const current = await db.query.bankTransaction.findFirst({
      where: (table, { and, eq }) =>
        and(eq(table.id, data.transactionId), eq(table.workspaceId, ownerWorkspace.id)),
    })

    if (!current) {
      throw new Error('Transaction not found')
    }

    const values =
      workspaceKind === 'personal'
        ? {
            encryptedPersonalPayload: encryptPersonalTransactionPayload({
              ...getPersonalPayload(current),
              noteOverride: data.note?.trim() || null,
              merchantOverride: data.merchantOverride?.trim() || null,
            }),
            personalSearchStatus: 'pending' as const,
            personalSearchIndexedAt: null,
            personalSearchError: null,
            updatedAt: new Date(),
          }
        : {
            note: data.note,
            updatedAt: new Date(),
          }

    const [updated] = await db
      .update(bankTransaction)
      .set(values)
      .where(
        and(
          eq(bankTransaction.id, data.transactionId),
          eq(bankTransaction.workspaceId, ownerWorkspace.id),
        ),
      )
      .returning()

    if (!updated) {
      throw new Error('Transaction not found')
    }

    if (workspaceKind === 'personal') {
      await indexPersonalTransaction(updated)
    }

    return { ok: true }
  })

export const getPersonalBankProviders = createServerFn({ method: 'GET' })
  .inputValidator((input: BankProvidersInput) => input)
  .middleware([authMiddleware])
  .handler(async ({ data }) => {
    const aspsps = await getEnableBankingAspsps({
      country: data.country?.trim() || 'SE',
      psuType: 'personal',
    })

    return aspsps
      .map((aspsp) => ({
        name: aspsp.name,
        country: aspsp.country,
        logo: aspsp.logo ?? null,
        beta: aspsp.beta ?? false,
        maximumConsentValidityDays: aspsp.maximum_consent_validity
          ? Math.floor(aspsp.maximum_consent_validity / 86_400)
          : null,
      }))
      .sort((first, second) => first.name.localeCompare(second.name))
  })

export const getTransactions = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = createDb()
    const ownerWorkspace = await getOrCreateWorkspace(context.session.user.id)

    const [accounts, transactions, connections, attachmentCounts, suggestedAttachmentCounts] =
      await Promise.all([
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
        db
          .select({ transactionId: attachment.suggestedTransactionId, count: count() })
          .from(attachment)
          .where(
            and(eq(attachment.workspaceId, ownerWorkspace.id), eq(attachment.status, 'suggested')),
          )
          .groupBy(attachment.suggestedTransactionId),
      ])

    const accountById = new Map(accounts.map((account) => [account.id, account]))
    const attachmentCountById = new Map(
      attachmentCounts
        .filter((r) => r.transactionId !== null)
        .map((r) => [r.transactionId as string, r.count]),
    )
    const suggestedAttachmentCountById = new Map(
      suggestedAttachmentCounts
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
          suggestedAttachmentCount: suggestedAttachmentCountById.get(transaction.id) ?? 0,
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

export const getPersonalTransactions = createServerFn({ method: 'GET' })
  .inputValidator((input: PersonalTransactionsInput) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = createDb()
    const personalWorkspace = await getOrCreateWorkspace(context.session.user.id, 'personal')
    const includedAccounts = await db.query.bankAccount.findMany({
      where: (table, { and, eq }) =>
        and(eq(table.workspaceId, personalWorkspace.id), eq(table.included, true)),
      orderBy: (table) => [desc(table.updatedAt)],
    })
    const includedAccountIds = includedAccounts.map((account) => account.id)

    if (includedAccountIds.length === 0) {
      return {
        accounts: [],
        transactions: [],
        total: 0,
        semanticSearchAvailable: false,
      }
    }

    const query = data.query?.trim()
    let matchingIds: string[] | undefined
    let semanticScores = new Map<string, number>()

    if (query) {
      const tokenHashes = tokenizePersonalSearchText(query).map(createPersonalSearchToken)
      const [tokenRows, vectorMatches] = await Promise.all([
        tokenHashes.length > 0
          ? db
              .select({ transactionId: personalTransactionSearchToken.transactionId })
              .from(personalTransactionSearchToken)
              .where(
                and(
                  eq(personalTransactionSearchToken.workspaceId, personalWorkspace.id),
                  inArray(personalTransactionSearchToken.tokenHash, tokenHashes),
                ),
              )
          : Promise.resolve([]),
        searchPersonalTransactionVectors({
          query,
          workspaceId: personalWorkspace.id,
          limit: Math.min(Math.max(data.limit ?? 200, 10), 50),
        }).catch(() => []),
      ])
      semanticScores = new Map(vectorMatches.map((match) => [match.id, match.score]))
      matchingIds = [
        ...new Set([
          ...tokenRows.map((row) => row.transactionId),
          ...vectorMatches.map((match) => match.id),
        ]),
      ]

      if (matchingIds.length === 0) {
        return {
          accounts: includedAccounts.map(serializePersonalAccount),
          transactions: [],
          total: 0,
          semanticSearchAvailable: vectorMatches.length > 0,
        }
      }
    }

    const conditions = [
      eq(bankTransaction.workspaceId, personalWorkspace.id),
      inArray(
        bankTransaction.accountId,
        data.accountId && includedAccountIds.includes(data.accountId)
          ? [data.accountId]
          : includedAccountIds,
      ),
      data.dateFrom
        ? gte(bankTransaction.bookedAt, new Date(`${data.dateFrom}T00:00:00`))
        : undefined,
      data.dateTo
        ? lte(bankTransaction.bookedAt, new Date(`${data.dateTo}T23:59:59.999`))
        : undefined,
      matchingIds ? inArray(bankTransaction.id, matchingIds) : undefined,
    ]
    const limit = Math.min(Math.max(data.limit ?? 200, 1), 500)
    const rows = await db.query.bankTransaction.findMany({
      where: and(...conditions),
      orderBy: (table) => [desc(table.bookedAt), desc(table.createdAt)],
      limit,
    })
    const accountById = new Map(includedAccounts.map((account) => [account.id, account]))
    const transactions = rows.map((row) =>
      serializePersonalTransaction(row, accountById.get(row.accountId)?.name ?? 'Unknown account'),
    )

    if (query) {
      transactions.sort((first, second) => {
        const scoreDelta =
          (semanticScores.get(second.id) ?? 0) - (semanticScores.get(first.id) ?? 0)
        return scoreDelta || second.bookedAt.localeCompare(first.bookedAt)
      })
    }

    return {
      accounts: includedAccounts.map(serializePersonalAccount),
      transactions,
      total: transactions.length,
      semanticSearchAvailable: semanticScores.size > 0,
    }
  })

export const getPersonalConnections = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = createDb()
    const personalWorkspace = await getOrCreateWorkspace(context.session.user.id, 'personal')
    const [connections, accounts] = await Promise.all([
      db.query.bankConnection.findMany({
        where: (table, { eq }) => eq(table.workspaceId, personalWorkspace.id),
        orderBy: (table) => [desc(table.createdAt)],
      }),
      db.query.bankAccount.findMany({
        where: (table, { eq }) => eq(table.workspaceId, personalWorkspace.id),
        orderBy: (table) => [desc(table.updatedAt)],
      }),
    ])

    return connections.map((connection) => ({
      id: connection.id,
      name: connection.name,
      status: connection.status,
      errorMessage: connection.errorMessage,
      lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
      consentValidUntil: connection.consentValidUntil?.toISOString() ?? null,
      disconnectedAt: connection.disconnectedAt?.toISOString() ?? null,
      accounts: accounts
        .filter((account) => account.connectionId === connection.id)
        .map((account) => ({
          ...serializePersonalAccount(account),
          included: account.included,
          ibanSuffix: getPersonalAccountPayload(account).iban?.slice(-4) ?? null,
          accountType: getPersonalAccountPayload(account).accountType,
        })),
    }))
  })

export const setPersonalAccountIncluded = createServerFn({ method: 'POST' })
  .inputValidator((input: SetPersonalAccountIncludedInput) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = createDb()
    const personalWorkspace = await getOrCreateWorkspace(context.session.user.id, 'personal')
    const account = await db.query.bankAccount.findFirst({
      where: (table, { and, eq }) =>
        and(eq(table.id, data.accountId), eq(table.workspaceId, personalWorkspace.id)),
    })

    if (!account) {
      throw new Error('Personal bank account not found')
    }

    await db
      .update(bankAccount)
      .set({ included: data.included, updatedAt: new Date() })
      .where(and(eq(bankAccount.id, account.id), eq(bankAccount.workspaceId, personalWorkspace.id)))

    let queuedRunId: string | null = null
    if (data.included) {
      const duplicateAccounts = await db.query.bankAccount.findMany({
        where: (table, { and, eq, ne }) =>
          and(
            eq(table.workspaceId, personalWorkspace.id),
            eq(table.providerAccountId, account.providerAccountId),
            ne(table.id, account.id),
          ),
        columns: { id: true },
      })

      if (duplicateAccounts.length > 0) {
        await db
          .update(bankAccount)
          .set({ included: false, updatedAt: new Date() })
          .where(
            and(
              eq(bankAccount.workspaceId, personalWorkspace.id),
              inArray(
                bankAccount.id,
                duplicateAccounts.map((item) => item.id),
              ),
            ),
          )
      }

      try {
        const handle = await tasks.trigger<typeof syncBankingTask>('sync-banking', {
          workspaceId: personalWorkspace.id,
          accountId: account.id,
          historyDays: 3 * 366,
          overlapDays: 14,
        })
        queuedRunId = handle.id
      } catch (error) {
        await db
          .update(bankAccount)
          .set({ included: false, updatedAt: new Date() })
          .where(
            and(eq(bankAccount.id, account.id), eq(bankAccount.workspaceId, personalWorkspace.id)),
          )
        throw error
      }
    }

    return { ok: true, included: data.included, queuedRunId }
  })

export const disconnectPersonalBankConnection = createServerFn({ method: 'POST' })
  .inputValidator((input: DisconnectBankConnectionInput) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = createDb()
    const personalWorkspace = await getOrCreateWorkspace(context.session.user.id, 'personal')
    const [updated] = await db
      .update(bankConnection)
      .set({
        status: 'disconnected',
        disconnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bankConnection.id, data.connectionId),
          eq(bankConnection.workspaceId, personalWorkspace.id),
        ),
      )
      .returning({ id: bankConnection.id })

    if (!updated) {
      throw new Error('Personal bank connection not found')
    }

    return { ok: true }
  })

export const getPersonalMcpTokens = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = createDb()
    const personalWorkspace = await getOrCreateWorkspace(context.session.user.id, 'personal')
    const [tokens, audits] = await Promise.all([
      db.query.personalMcpToken.findMany({
        where: (table, { eq }) => eq(table.workspaceId, personalWorkspace.id),
        orderBy: (table) => [desc(table.createdAt)],
      }),
      db.query.personalMcpAudit.findMany({
        where: (table, { eq }) => eq(table.workspaceId, personalWorkspace.id),
        orderBy: (table) => [desc(table.createdAt)],
        limit: 20,
      }),
    ])

    return {
      endpoint: process.env.MCP_PUBLIC_URL?.trim() || null,
      tokens: tokens.map((token) => ({
        id: token.id,
        name: token.name,
        tokenPrefix: token.tokenPrefix,
        createdAt: token.createdAt.toISOString(),
        lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
        revokedAt: token.revokedAt?.toISOString() ?? null,
      })),
      recentAccess: audits.map((audit) => ({
        id: audit.id,
        tokenId: audit.tokenId,
        toolName: audit.toolName,
        resultCount: audit.resultCount,
        createdAt: audit.createdAt.toISOString(),
      })),
    }
  })

export const createPersonalMcpToken = createServerFn({ method: 'POST' })
  .inputValidator((input: CreatePersonalMcpTokenInput) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const name = data.name.trim()
    if (!name || name.length > 80) {
      throw new Error('Token name must contain between 1 and 80 characters')
    }

    const db = createDb()
    const personalWorkspace = await getOrCreateWorkspace(context.session.user.id, 'personal')
    const token = `hv_personal_${randomBytes(32).toString('base64url')}`
    const [stored] = await db
      .insert(personalMcpToken)
      .values({
        workspaceId: personalWorkspace.id,
        name,
        tokenHash: createHash('sha256').update(token).digest('base64url'),
        tokenPrefix: `${token.slice(0, 24)}…`,
      })
      .returning({ id: personalMcpToken.id })

    return {
      id: stored.id,
      token,
    }
  })

export const revokePersonalMcpToken = createServerFn({ method: 'POST' })
  .inputValidator((input: RevokePersonalMcpTokenInput) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = createDb()
    const personalWorkspace = await getOrCreateWorkspace(context.session.user.id, 'personal')
    const [revoked] = await db
      .update(personalMcpToken)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(personalMcpToken.id, data.tokenId),
          eq(personalMcpToken.workspaceId, personalWorkspace.id),
        ),
      )
      .returning({ id: personalMcpToken.id })

    if (!revoked) {
      throw new Error('Personal MCP token not found')
    }

    return { ok: true }
  })

export const reviewPersonalTransfer = createServerFn({ method: 'POST' })
  .inputValidator((input: ReviewPersonalTransferInput) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = createDb()
    const personalWorkspace = await getOrCreateWorkspace(context.session.user.id, 'personal')
    const transaction = await db.query.bankTransaction.findFirst({
      where: (table, { and, eq }) =>
        and(eq(table.id, data.transactionId), eq(table.workspaceId, personalWorkspace.id)),
    })

    if (!transaction?.transferPairId || transaction.transferState !== 'suggested') {
      throw new Error('Transfer suggestion not found')
    }

    const pair = await db.query.bankTransaction.findMany({
      where: (table, { and, eq }) =>
        and(
          eq(table.workspaceId, personalWorkspace.id),
          eq(table.transferPairId, transaction.transferPairId as string),
        ),
      columns: { id: true },
    })
    const ids = pair.map((item) => item.id)
    if (ids.length !== 2) {
      throw new Error('Transfer pair is incomplete')
    }

    await db
      .update(bankTransaction)
      .set(
        data.action === 'confirm'
          ? { transferState: 'confirmed', updatedAt: new Date() }
          : {
              transferState: 'dismissed',
              transferPairId: null,
              transferConfidence: null,
              updatedAt: new Date(),
            },
      )
      .where(
        and(
          eq(bankTransaction.workspaceId, personalWorkspace.id),
          inArray(bankTransaction.id, ids),
        ),
      )

    return { ok: true }
  })

export const importTransactionsCsv = createServerFn({ method: 'POST' })
  .inputValidator((input: ImportCsvInput) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = createDb()
    const ownerWorkspace = await getOrCreateWorkspace(context.session.user.id)
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
  workspaceKind,
  connectionId,
  accounts,
}: {
  workspaceId: string
  workspaceKind: WorkspaceKind
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

    const [details, balances] = await Promise.all([
      getEnableBankingAccountDetails(accountUid).catch(() => enableBankingAccount),
      getEnableBankingAccountBalances(accountUid).catch(() => []),
    ])
    const accountDetails = {
      ...enableBankingAccount,
      ...details,
    }
    const balance = pickEnableBankingBalance(balances)
    const personalAccountPayload =
      workspaceKind === 'personal'
        ? {
            name: getEnableBankingAccountName(accountDetails),
            iban: accountDetails.account_id?.iban ?? null,
            accountType: accountDetails.cash_account_type ?? null,
            rawMetadata: { details: accountDetails, balances },
          }
        : null
    const [account] = await db
      .insert(bankAccount)
      .values({
        workspaceId,
        connectionId,
        providerAccountId: accountUid,
        name: personalAccountPayload
          ? 'Encrypted personal account'
          : getEnableBankingAccountName(accountDetails),
        iban: personalAccountPayload ? null : (accountDetails.account_id?.iban ?? null),
        currency: accountDetails.currency ?? balance?.currency ?? 'SEK',
        accountType: personalAccountPayload ? null : (accountDetails.cash_account_type ?? null),
        currentBalance: balance?.amount ?? null,
        availableBalance: balance?.amount ?? null,
        rawMetadata: personalAccountPayload ? null : { details: accountDetails, balances },
        encryptedPersonalPayload: personalAccountPayload
          ? encryptPersonalAccountPayload(personalAccountPayload)
          : null,
        included: workspaceKind === 'business',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [bankAccount.connectionId, bankAccount.providerAccountId],
        set: {
          name: personalAccountPayload
            ? 'Encrypted personal account'
            : getEnableBankingAccountName(accountDetails),
          iban: personalAccountPayload ? null : (accountDetails.account_id?.iban ?? null),
          currency: accountDetails.currency ?? balance?.currency ?? 'SEK',
          accountType: personalAccountPayload ? null : (accountDetails.cash_account_type ?? null),
          currentBalance: balance?.amount ?? null,
          availableBalance: balance?.amount ?? null,
          rawMetadata: personalAccountPayload ? null : { details: accountDetails, balances },
          encryptedPersonalPayload: personalAccountPayload
            ? encryptPersonalAccountPayload(personalAccountPayload)
            : null,
          updatedAt: now,
        },
      })
      .returning()

    if (workspaceKind === 'business') {
      const transactions = await getEnableBankingTransactions(accountUid, {
        dateFrom: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      })

      for (const transaction of transactions.map((item) =>
        normalizeEnableBankingTransaction(item, {
          accountId: accountUid,
          fallbackCurrency: account.currency,
        }),
      )) {
        await upsertBusinessTransaction({
          workspaceId,
          connectionId,
          accountId: account.id,
          providerAccountId: accountUid,
          transaction,
          now,
        })
        syncedTransactions += 1
      }
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

async function upsertBusinessTransaction({
  workspaceId,
  connectionId,
  accountId,
  providerAccountId,
  transaction,
  now,
}: {
  workspaceId: string
  connectionId: string
  accountId: string
  providerAccountId: string
  transaction: NormalizedTransaction
  now: Date
}) {
  const db = createDb()
  await db
    .insert(bankTransaction)
    .values({
      workspaceId,
      connectionId,
      accountId,
      provider: 'enable_banking',
      providerTransactionId: transaction.providerTransactionId,
      internalId: createEnableBankingInternalId(
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

async function indexPersonalTransaction(
  transaction: typeof bankTransaction.$inferSelect,
  payload = getPersonalPayload(transaction),
) {
  const db = createDb()
  const searchText = [
    payload.merchantOverride,
    payload.merchantName,
    payload.counterpartyName,
    payload.description,
    payload.noteOverride,
    payload.note,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n')
  const tokenHashes = tokenizePersonalSearchText(searchText).map(createPersonalSearchToken)

  await db
    .delete(personalTransactionSearchToken)
    .where(eq(personalTransactionSearchToken.transactionId, transaction.id))

  if (tokenHashes.length > 0) {
    await db.insert(personalTransactionSearchToken).values(
      tokenHashes.map((tokenHash) => ({
        workspaceId: transaction.workspaceId,
        transactionId: transaction.id,
        tokenHash,
      })),
    )
  }

  try {
    const result = await upsertPersonalTransactionVector({
      transactionId: transaction.id,
      text: searchText,
      metadata: {
        workspaceId: transaction.workspaceId,
        accountId: transaction.accountId,
        bookedAt: transaction.bookedAt.toISOString(),
        currency: transaction.currency,
        direction: Number(transaction.amount) < 0 ? 'debit' : 'credit',
      },
    })

    await db
      .update(bankTransaction)
      .set({
        personalSearchStatus: result.indexed ? 'indexed' : 'pending',
        personalSearchIndexedAt: result.indexed ? new Date() : null,
        personalSearchError: null,
      })
      .where(eq(bankTransaction.id, transaction.id))
  } catch (error) {
    await db
      .update(bankTransaction)
      .set({
        personalSearchStatus: 'error',
        personalSearchError: error instanceof Error ? error.message : 'Semantic indexing failed',
      })
      .where(eq(bankTransaction.id, transaction.id))
  }
}

export const startEnableBankingAuthorization = createServerFn({ method: 'POST' })
  .inputValidator((input: StartEnableBankingAuthorizationInput) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const request = getRequest()
    const db = createDb()
    const workspaceKind =
      data.workspaceKind ?? (data.psuType === 'personal' ? 'personal' : 'business')
    const ownerWorkspace = await getOrCreateWorkspace(context.session.user.id, workspaceKind)
    const state = randomUUID()
    const redirectUrl = `${getEnableBankingRedirectOrigin(request.url)}/api/banking/enable-banking/callback`
    const now = new Date()
    const authMethod = data.authMethod?.trim()
    const body = {
      access: {
        valid_until: new Date(
          Date.now() + (workspaceKind === 'personal' ? 179 : 89) * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
      aspsp: {
        name: data.aspspName.trim(),
        country: (data.aspspCountry?.trim() || 'SE').toUpperCase(),
      },
      state,
      redirect_url: redirectUrl,
      psu_type: data.psuType ?? (workspaceKind === 'personal' ? 'personal' : 'business'),
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
        workspaceKind,
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
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const db = createDb()
    const ownerWorkspaces = await db.query.workspace.findMany({
      where: (table, { eq }) => eq(table.ownerId, context.session.user.id),
    })
    const ownerWorkspaceIds = ownerWorkspaces.map((item) => item.id)

    if (ownerWorkspaceIds.length === 0) {
      throw new Error('No owner workspace exists')
    }

    const pendingConnection = await db.query.bankConnection.findFirst({
      where: (table, { and, eq, inArray }) =>
        and(
          inArray(table.workspaceId, ownerWorkspaceIds),
          eq(table.provider, 'enable_banking'),
          eq(table.providerConnectionId, `auth:${data.state}`),
        ),
    })

    if (!pendingConnection) {
      throw new Error('Enable Banking authorization state was not found')
    }
    const ownerWorkspace = ownerWorkspaces.find((item) => item.id === pendingConnection.workspaceId)

    if (!ownerWorkspace) {
      throw new Error('Enable Banking authorization workspace was not found')
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
        rawMetadata:
          ownerWorkspace.kind === 'personal'
            ? {
                aspsp: response.aspsp,
                access: response.access,
                workspaceKind: 'personal',
              }
            : response,
        encryptedPersonalPayload:
          ownerWorkspace.kind === 'personal' ? encryptPersonalProviderPayload(response) : null,
        consentValidUntil: response.access?.valid_until
          ? new Date(response.access.valid_until)
          : null,
        disconnectedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(bankConnection.id, pendingConnection.id))
      .returning()

    const synced = await syncEnableBankingConnection({
      workspaceId: ownerWorkspace.id,
      workspaceKind: ownerWorkspace.kind,
      connectionId: connection.id,
      accounts: response.accounts,
    })

    return {
      ok: true,
      workspaceKind: ownerWorkspace.kind,
      ...synced,
    }
  })

function getEnableBankingRedirectOrigin(requestUrl: string) {
  const configuredOrigin = process.env.ENABLE_BANKING_REDIRECT_ORIGIN?.replace(/\/$/, '')

  if (configuredOrigin) {
    return configuredOrigin
  }

  return new URL(requestUrl).origin
}

function getPersonalPayload(transaction: typeof bankTransaction.$inferSelect) {
  if (transaction.encryptedPersonalPayload) {
    return decryptPersonalTransactionPayload(transaction.encryptedPersonalPayload)
  }

  return {
    description: transaction.description,
    merchantName: transaction.merchantName,
    counterpartyName: transaction.counterpartyName,
    note: transaction.note,
    rawMetadata: transaction.rawMetadata,
    merchantOverride: null,
    noteOverride: null,
  }
}

function serializePersonalAccount(account: typeof bankAccount.$inferSelect) {
  const payload = getPersonalAccountPayload(account)

  return {
    id: account.id,
    name: payload.name,
    currency: account.currency,
    currentBalance: account.currentBalance,
    availableBalance: account.availableBalance,
    updatedAt: account.updatedAt.toISOString(),
  }
}

function getPersonalAccountPayload(account: typeof bankAccount.$inferSelect) {
  if (!account.encryptedPersonalPayload) {
    return {
      name: account.name,
      iban: account.iban,
      accountType: account.accountType,
      rawMetadata: account.rawMetadata,
    }
  }

  return decryptPersonalAccountPayload(account.encryptedPersonalPayload)
}

function serializePersonalTransaction(
  transaction: typeof bankTransaction.$inferSelect,
  accountName: string,
) {
  const payload = getPersonalPayload(transaction)

  return {
    id: transaction.id,
    accountId: transaction.accountId,
    accountName,
    bookedAt: transaction.bookedAt.toISOString(),
    amount: transaction.amount,
    currency: transaction.currency,
    description: payload.description,
    merchantName: payload.merchantOverride ?? payload.merchantName,
    originalMerchantName: payload.merchantName,
    counterpartyName: payload.counterpartyName,
    note: payload.noteOverride ?? payload.note,
    status: transaction.status,
    transferState: transaction.transferState,
    transferPairId: transaction.transferPairId,
    transferConfidence: transaction.transferConfidence,
  }
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
    status: 'booked',
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
