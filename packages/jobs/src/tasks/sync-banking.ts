import {
  createEnableBankingInternalId,
  type EnableBankingAccount,
  getEnableBankingAccountBalances,
  getEnableBankingAccountDetails,
  getEnableBankingAccountName,
  getEnableBankingSessionAccounts,
  getEnableBankingTransactions,
  type NormalizedEnableBankingTransaction,
  normalizeEnableBankingTransaction,
  pickEnableBankingBalance,
} from '@bank-data/banking'
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
      : await getEnableBankingSessionAccounts(connection.providerConnectionId)

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
        dateFrom: getDateFrom(connection.lastSyncedAt, overlapDays),
      }),
    ])

    const accountDetails = { ...enableBankingAccount, ...details }
    const balance = pickEnableBankingBalance(balances)

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

    for (const transaction of transactions.map((item) =>
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
  transaction: NormalizedEnableBankingTransaction
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
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
