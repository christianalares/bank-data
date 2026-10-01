import { logger, schedules, schemaTask } from '@trigger.dev/sdk'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  createEnableBankingInternalId,
  ENABLE_BANKING_NO_ACCOUNTS_ERROR,
  type EnableBankingAccount,
  getEnableBankingAccountBalances,
  getEnableBankingAccountDetails,
  getEnableBankingAccountName,
  getEnableBankingSessionAccounts,
  getEnableBankingTransactions,
  matchPersonalTransfers,
  type NormalizedEnableBankingTransaction,
  normalizeEnableBankingTransaction,
  pickEnableBankingBalance,
  upsertPersonalTransactionVector,
} from '#banking'
import {
  bankAccount,
  bankConnection,
  bankTransaction,
  createDb,
  createPersonalSearchToken,
  type Database,
  decryptPersonalAccountPayload,
  decryptPersonalTransactionPayload,
  encryptPersonalAccountPayload,
  encryptPersonalTransactionPayload,
  personalTransactionSearchToken,
  tokenizePersonalSearchText,
} from '#db'

import { matchPendingAttachmentsTask } from './match-pending-attachments'

const TRANSACTION_IMPORT_CONCURRENCY = 6

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

const syncBankingPayloadSchema = z.object({
  overlapDays: z.number().int().positive().optional().default(14),
  workspaceId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  historyDays: z
    .number()
    .int()
    .positive()
    .max(3 * 366)
    .optional(),
})

export type SyncBankingPayload = z.infer<typeof syncBankingPayloadSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────────────────────────────────────

export async function runBankSync(payload: SyncBankingPayload) {
  const db = createDb()
  const overlapDays = payload.overlapDays
  // Include `error` connections so a previous transient provider failure
  // self-heals on the next run. Genuine consent failures are moved to
  // `disconnected` (see the catch block) and require manual re-authorization,
  // so they are intentionally excluded here.
  const allConnections = await db.query.bankConnection.findMany({
    where: (table, { and, eq, inArray }) =>
      and(eq(table.provider, 'enable_banking'), inArray(table.status, ['connected', 'error'])),
  })
  const targetAccount = payload.accountId
    ? await db.query.bankAccount.findFirst({
        where: (table, { eq }) => eq(table.id, payload.accountId as string),
      })
    : null

  if (
    payload.accountId &&
    (!targetAccount ||
      !targetAccount.included ||
      (payload.workspaceId && targetAccount.workspaceId !== payload.workspaceId))
  ) {
    throw new Error('Included personal account was not found for the requested history import')
  }

  const connections = allConnections.filter(
    (connection) =>
      (!payload.workspaceId || connection.workspaceId === payload.workspaceId) &&
      (!targetAccount || connection.id === targetAccount.connectionId),
  )

  if (connections.length === 0) {
    if (payload.accountId || payload.workspaceId) {
      throw new Error('No syncable Enable Banking connection found for the requested import')
    }

    logger.info('No syncable Enable Banking connections found; nothing to sync.')
  }

  let syncedAccounts = 0
  let syncedTransactions = 0
  const transientFailures: { connectionId: string; message: string }[] = []

  for (const connection of connections) {
    try {
      const result = await syncEnableBankingConnection({
        db,
        connection,
        overlapDays,
        targetAccountId: payload.accountId,
        historyDays: payload.historyDays,
      })
      syncedAccounts += result.syncedAccounts
      syncedTransactions += result.syncedTransactions
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Enable Banking sync failed'
      const status = isConsentFailure(message) ? 'disconnected' : 'error'

      logger.error('Failed to sync connection', { connectionId: connection.id, status, message })

      await db
        .update(bankConnection)
        .set({
          status,
          errorMessage: message,
          disconnectedAt: status === 'disconnected' ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(bankConnection.id, connection.id))

      // Consent failures need a human to re-authorize; retrying is pointless.
      // Transient failures should surface as a failed run (alerting + retries).
      if (status === 'error' && message !== ENABLE_BANKING_NO_ACCOUNTS_ERROR) {
        transientFailures.push({ connectionId: connection.id, message })
      }
    }
  }

  const workspaceIds = [...new Set(connections.map((c) => c.workspaceId))]
  const businessWorkspaces =
    workspaceIds.length > 0
      ? await db.query.workspace.findMany({
          where: (table, { and, eq, inArray }) =>
            and(inArray(table.id, workspaceIds), eq(table.kind, 'business')),
        })
      : []
  const personalWorkspaces =
    workspaceIds.length > 0
      ? await db.query.workspace.findMany({
          where: (table, { and, eq, inArray }) =>
            and(inArray(table.id, workspaceIds), eq(table.kind, 'personal')),
        })
      : []
  await Promise.all(
    businessWorkspaces.map((item) => matchPendingAttachmentsTask.trigger({ workspaceId: item.id })),
  )
  await Promise.all(
    personalWorkspaces.map((item) => matchPersonalTransfers({ db, workspaceId: item.id })),
  )

  if (transientFailures.length > 0) {
    throw new Error(
      `Enable Banking sync failed for ${transientFailures.length} connection(s): ${transientFailures
        .map((failure) => `${failure.connectionId} (${failure.message})`)
        .join('; ')}`,
    )
  }

  return { syncedConnections: connections.length, syncedAccounts, syncedTransactions }
}

export const syncBankingTask = schemaTask({
  id: 'sync-banking',
  schema: syncBankingPayloadSchema,
  maxDuration: 1_800,
  run: runBankSync,
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
  targetAccountId,
  historyDays,
}: {
  db: Database
  connection: typeof bankConnection.$inferSelect
  overlapDays: number
  targetAccountId?: string
  historyDays?: number
}) {
  const connectionWorkspace = await db.query.workspace.findFirst({
    where: (table, { eq }) => eq(table.id, connection.workspaceId),
  })

  if (!connectionWorkspace) {
    throw new Error('Bank connection workspace not found')
  }

  if (targetAccountId && connectionWorkspace.kind !== 'personal') {
    throw new Error('History imports can only target personal bank accounts')
  }

  const localAccounts = await db.query.bankAccount.findMany({
    where: (table, { eq }) => eq(table.connectionId, connection.id),
  })
  const includedLocalAccounts = localAccounts.filter(
    (account) =>
      (connectionWorkspace.kind === 'business' || account.included) &&
      (!targetAccountId || account.id === targetAccountId),
  )
  const accounts: EnableBankingAccount[] =
    localAccounts.length > 0
      ? includedLocalAccounts.map((account) => {
          const personalPayload = account.encryptedPersonalPayload
            ? decryptPersonalAccountPayload(account.encryptedPersonalPayload)
            : null

          return {
            uid: account.providerAccountId,
            name: personalPayload?.name ?? account.name,
            currency: account.currency,
            cash_account_type: personalPayload?.accountType ?? account.accountType ?? undefined,
            account_id: { iban: personalPayload?.iban ?? account.iban ?? undefined },
          }
        })
      : await getEnableBankingSessionAccounts(connection.providerConnectionId)

  if (localAccounts.length === 0 && accounts.length === 0) {
    throw new Error(ENABLE_BANKING_NO_ACCOUNTS_ERROR)
  }

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
      getEnableBankingTransactions(accountUid, {
        dateFrom: historyDays
          ? new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
          : getDateFrom(connection.lastSyncedAt, overlapDays),
        strategy: historyDays ? 'longest' : 'default',
      }),
    ])

    const accountDetails = { ...enableBankingAccount, ...details }
    const balance = pickEnableBankingBalance(balances)
    const existingPersonalAccount = localAccounts.find(
      (account) => account.providerAccountId === accountUid,
    )
    const existingPersonalPayload = existingPersonalAccount?.encryptedPersonalPayload
      ? decryptPersonalAccountPayload(existingPersonalAccount.encryptedPersonalPayload)
      : null
    const personalAccountPayload =
      connectionWorkspace.kind === 'personal'
        ? {
            name: getEnableBankingAccountName(accountDetails),
            nameOverride: existingPersonalPayload?.nameOverride ?? null,
            iban: accountDetails.account_id?.iban ?? null,
            accountType: accountDetails.cash_account_type ?? null,
            rawMetadata: { details: accountDetails, balances },
          }
        : null

    const [account] = await db
      .insert(bankAccount)
      .values({
        workspaceId: connection.workspaceId,
        connectionId: connection.id,
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
        included: connectionWorkspace.kind === 'business',
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

    if (connectionWorkspace.kind === 'personal' && !account.included) {
      continue
    }

    const normalizedTransactions = transactions.map((item) =>
      normalizeEnableBankingTransaction(item, {
        accountId: accountUid,
        fallbackCurrency: account.currency,
      }),
    )

    for (
      let offset = 0;
      offset < normalizedTransactions.length;
      offset += TRANSACTION_IMPORT_CONCURRENCY
    ) {
      const batch = normalizedTransactions.slice(offset, offset + TRANSACTION_IMPORT_CONCURRENCY)
      await Promise.all(
        batch.map((transaction) =>
          upsertBankTransaction({
            db,
            workspaceId: connection.workspaceId,
            connectionId: connection.id,
            accountId: account.id,
            providerAccountId: accountUid,
            transaction,
            workspaceKind: connectionWorkspace.kind,
            now,
          }),
        ),
      )
      syncedTransactions += batch.length
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
  workspaceKind,
  now,
}: {
  db: Database
  workspaceId: string
  connectionId: string
  accountId: string
  providerAccountId: string
  transaction: NormalizedEnableBankingTransaction
  workspaceKind: 'business' | 'personal'
  now: Date
}) {
  const internalId = createEnableBankingInternalId(
    workspaceId,
    providerAccountId,
    transaction.providerTransactionId,
  )
  const existing = await db.query.bankTransaction.findFirst({
    where: (table, { eq }) => eq(table.internalId, internalId),
  })
  const existingPayload = existing?.encryptedPersonalPayload
    ? decryptPersonalTransactionPayload(existing.encryptedPersonalPayload)
    : null
  const personalPayload =
    workspaceKind === 'personal'
      ? {
          description: transaction.description,
          merchantName: transaction.merchantName,
          counterpartyName: transaction.counterpartyName,
          note: null,
          rawMetadata: transaction.rawMetadata,
          merchantOverride: existingPayload?.merchantOverride ?? null,
          noteOverride: existingPayload?.noteOverride ?? null,
        }
      : null
  const [stored] = await db
    .insert(bankTransaction)
    .values({
      workspaceId,
      connectionId,
      accountId,
      provider: 'enable_banking',
      providerTransactionId: transaction.providerTransactionId,
      internalId,
      status: transaction.status,
      bookedAt: transaction.bookedAt,
      valueAt: transaction.valueAt,
      amount: transaction.amount,
      currency: transaction.currency,
      description:
        workspaceKind === 'personal' ? 'Encrypted personal transaction' : transaction.description,
      merchantName: workspaceKind === 'personal' ? null : transaction.merchantName,
      counterpartyName: workspaceKind === 'personal' ? null : transaction.counterpartyName,
      balanceAfterTransaction: transaction.balanceAfterTransaction,
      rawMetadata: workspaceKind === 'personal' ? null : transaction.rawMetadata,
      encryptedPersonalPayload: personalPayload
        ? encryptPersonalTransactionPayload(personalPayload)
        : null,
      personalSearchStatus: workspaceKind === 'personal' ? 'pending' : null,
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
        description:
          workspaceKind === 'personal' ? 'Encrypted personal transaction' : transaction.description,
        merchantName: workspaceKind === 'personal' ? null : transaction.merchantName,
        counterpartyName: workspaceKind === 'personal' ? null : transaction.counterpartyName,
        balanceAfterTransaction: transaction.balanceAfterTransaction,
        rawMetadata: workspaceKind === 'personal' ? null : transaction.rawMetadata,
        encryptedPersonalPayload: personalPayload
          ? encryptPersonalTransactionPayload(personalPayload)
          : null,
        personalSearchStatus: workspaceKind === 'personal' ? 'pending' : null,
        personalSearchIndexedAt: workspaceKind === 'personal' ? null : undefined,
        personalSearchError: workspaceKind === 'personal' ? null : undefined,
        updatedAt: now,
      },
    })
    .returning()

  if (personalPayload) {
    await indexPersonalTransaction(db, stored, personalPayload)
  }
}

async function indexPersonalTransaction(
  db: Database,
  transaction: typeof bankTransaction.$inferSelect,
  payload: ReturnType<typeof decryptPersonalTransactionPayload>,
) {
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
    logger.warn('Personal semantic indexing failed', {
      transactionId: transaction.id,
      error: error instanceof Error ? error.message : String(error),
    })
    await db
      .update(bankTransaction)
      .set({
        personalSearchStatus: 'error',
        personalSearchError: error instanceof Error ? error.message : 'Semantic indexing failed',
      })
      .where(eq(bankTransaction.id, transaction.id))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Distinguish a genuine consent/authorization failure (the session has been
 * revoked or expired and the user must re-authorize) from a transient provider
 * hiccup. Enable Banking surfaces auth problems as HTTP 401/403; everything
 * else (e.g. a bank-side "Internal server error" ASPSP_ERROR) is treated as
 * transient and retried on the next run instead of permanently disabling the
 * connection.
 */
function isConsentFailure(message: string) {
  return message.includes('(401)') || message.includes('(403)')
}

function getDateFrom(lastSyncedAt: Date | null, overlapDays: number) {
  const fallbackDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  if (!lastSyncedAt) {
    return fallbackDate.toISOString().slice(0, 10)
  }

  const overlapDate = new Date(lastSyncedAt)
  overlapDate.setDate(overlapDate.getDate() - overlapDays)

  return overlapDate.toISOString().slice(0, 10)
}
