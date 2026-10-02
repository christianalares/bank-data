import { and, eq } from 'drizzle-orm'
import {
  createEnableBankingInternalId,
  ENABLE_BANKING_NO_ACCOUNTS_ERROR,
  type EnableBankingAccount,
  getEnableBankingAccountBalances,
  getEnableBankingAccountName,
  getEnableBankingSessionAccounts,
  getEnableBankingTransactions,
  type NormalizedEnableBankingTransaction,
  normalizeEnableBankingTransaction,
  pickEnableBankingBalance,
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

const TRANSACTION_IMPORT_CONCURRENCY = 6
const PENDING_LIFETIME_MS = 30 * 60 * 1000
const PROVIDER_ATTEMPTS = 3
const BACKGROUND_FETCH_INTERVAL_MS = 6 * 60 * 60 * 1000
const ASPSP_RATE_LIMIT_ERROR = 'ASPSP_RATE_LIMIT_EXCEEDED'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SyncBankingPayload = {
  overlapDays: number
  workspaceId?: string
  accountId?: string
  historyDays?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────────────────────────────────────

export async function runBankSync(payload: SyncBankingPayload, db: Database = createDb()) {
  const startedAt = new Date()
  const expiredPending = await expirePendingConsents(db, startedAt)
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

    console.info('No syncable Enable Banking connections found; nothing to sync.')
  }

  let syncedConnections = 0
  let syncedAccounts = 0
  let syncedTransactions = 0
  let skippedHistorical = 0
  let bookingDateDrifts = 0
  let lastSuccessAt: string | null = null
  let deferredConnections = 0
  const transientFailures: { connectionId: string; message: string }[] = []

  for (const connection of connections) {
    if (!payload.accountId && shouldDeferBackgroundSync(connection, startedAt)) {
      deferredConnections += 1
      console.info('Deferred recent background bank fetch', { connectionId: connection.id })
      if (connection.status === 'error') {
        transientFailures.push({
          connectionId: connection.id,
          message: 'ASPSP background-fetch limit remains active',
        })
      }
      continue
    }

    try {
      if (connection.consentValidUntil && connection.consentValidUntil <= startedAt) {
        throw new Error('Bank consent expired')
      }
      const result = await syncEnableBankingConnection({
        db,
        connection,
        overlapDays,
        targetAccountId: payload.accountId,
        historyDays: payload.historyDays,
      })
      syncedConnections += 1
      syncedAccounts += result.syncedAccounts
      syncedTransactions += result.syncedTransactions
      skippedHistorical += result.skippedHistorical
      bookingDateDrifts += result.bookingDateDrifts
      lastSuccessAt = result.lastSuccessAt
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Enable Banking sync failed'
      const status = isConsentFailure(message) ? 'disconnected' : 'error'

      console.error('Failed to sync connection', { connectionId: connection.id, status, message })

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
      if (status === 'error') {
        transientFailures.push({ connectionId: connection.id, message })
      }
    }
  }

  if (transientFailures.length > 0) {
    throw new Error(
      `Enable Banking sync failed for ${transientFailures.length} connection(s): ${transientFailures
        .map((failure) => `${failure.connectionId} (${failure.message})`)
        .join('; ')}`,
    )
  }

  return {
    syncedConnections,
    deferredConnections,
    syncedAccounts,
    syncedTransactions,
    skippedHistorical,
    bookingDateDrifts,
    expiredPending,
    lastSuccessAt,
  }
}

async function expirePendingConsents(db: Database, now: Date) {
  const pending = await db.query.bankConnection.findMany({
    where: (table, { and, eq, lt }) =>
      and(
        eq(table.provider, 'enable_banking'),
        eq(table.status, 'pending'),
        lt(table.createdAt, new Date(now.getTime() - PENDING_LIFETIME_MS)),
      ),
  })
  let expired = 0

  for (const connection of pending) {
    const metadata = connection.rawMetadata as {
      flow?: string
      selectionCompleteAt?: string
    } | null
    if (metadata?.flow !== 'mcp-consent' || metadata.selectionCompleteAt) {
      continue
    }
    const updated = await db
      .update(bankConnection)
      .set({
        status: 'disconnected',
        errorMessage: 'Bank authorization or account selection expired',
        disconnectedAt: now,
        updatedAt: now,
      })
      .where(and(eq(bankConnection.id, connection.id), eq(bankConnection.status, 'pending')))
      .returning({ id: bankConnection.id })
    expired += updated.length
  }

  return expired
}

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
      : await retryProvider(() => getEnableBankingSessionAccounts(connection.providerConnectionId))

  if (localAccounts.length === 0 && accounts.length === 0) {
    throw new Error(ENABLE_BANKING_NO_ACCOUNTS_ERROR)
  }

  const now = new Date()
  let syncedTransactions = 0
  let skippedHistorical = 0
  let bookingDateDrifts = 0

  for (const enableBankingAccount of accounts) {
    const accountUid = enableBankingAccount.uid ?? enableBankingAccount.identification_hash

    if (!accountUid) {
      continue
    }

    const [balances, transactions] = await Promise.all([
      retryProvider(() => getEnableBankingAccountBalances(accountUid)),
      retryProvider(() =>
        getEnableBankingTransactions(accountUid, {
          dateFrom: historyDays
            ? new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
            : getDateFrom(connection.lastSyncedAt, overlapDays),
          strategy: historyDays ? 'longest' : 'default',
        }),
      ),
    ])

    const accountDetails = enableBankingAccount
    const balance = pickEnableBankingBalance(balances)
    const existingPersonalAccount = localAccounts.find(
      (account) => account.providerAccountId === accountUid,
    )
    const existingPersonalPayload = existingPersonalAccount?.encryptedPersonalPayload
      ? decryptPersonalAccountPayload(existingPersonalAccount.encryptedPersonalPayload)
      : null
    const historicalAccounts =
      connectionWorkspace.kind === 'personal' && accountDetails.account_id?.iban
        ? (
            await db.query.bankAccount.findMany({
              where: (table, { eq }) => eq(table.workspaceId, connection.workspaceId),
            })
          ).filter((account) => {
            if (
              account.id === existingPersonalAccount?.id ||
              account.currency !== (accountDetails.currency ?? balance?.currency ?? 'SEK')
            ) {
              return false
            }
            const payload = account.encryptedPersonalPayload
              ? decryptPersonalAccountPayload(account.encryptedPersonalPayload)
              : null
            return payload?.iban === accountDetails.account_id?.iban
          })
        : []
    const historicalOverrides = historicalAccounts
      .map((account) =>
        account.encryptedPersonalPayload
          ? decryptPersonalAccountPayload(account.encryptedPersonalPayload).nameOverride
          : null,
      )
      .filter((value): value is string => Boolean(value))
    if (new Set(historicalOverrides).size > 1) {
      throw new Error('Conflicting name overrides for the same personal bank account')
    }
    const personalAccountPayload =
      connectionWorkspace.kind === 'personal'
        ? {
            name: getEnableBankingAccountName(accountDetails),
            nameOverride: existingPersonalPayload?.nameOverride ?? historicalOverrides[0] ?? null,
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
        currentBalance: balance?.amount ?? existingPersonalAccount?.currentBalance ?? null,
        availableBalance: balance?.amount ?? existingPersonalAccount?.availableBalance ?? null,
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
          currentBalance: balance?.amount ?? existingPersonalAccount?.currentBalance ?? null,
          availableBalance: balance?.amount ?? existingPersonalAccount?.availableBalance ?? null,
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
    const uniqueTransactions = new Map<string, NormalizedEnableBankingTransaction>()
    for (const transaction of normalizedTransactions) {
      const previous = uniqueTransactions.get(transaction.providerTransactionId)
      if (previous && !sameNormalizedTransaction(previous, transaction)) {
        throw new Error('Provider returned conflicting booked transactions with one reference')
      }
      uniqueTransactions.set(transaction.providerTransactionId, transaction)
    }
    const bookedTransactions = [...uniqueTransactions.values()]
    const historicalTransactions = historicalAccounts.length
      ? await db.query.bankTransaction.findMany({
          where: (table, { inArray }) =>
            inArray(
              table.accountId,
              historicalAccounts.map((item) => item.id),
            ),
        })
      : []

    for (
      let offset = 0;
      offset < bookedTransactions.length;
      offset += TRANSACTION_IMPORT_CONCURRENCY
    ) {
      const batch = bookedTransactions.slice(offset, offset + TRANSACTION_IMPORT_CONCURRENCY)
      await Promise.all(
        batch.map(async (transaction) => {
          if (matchesHistoricalTransaction(transaction, historicalTransactions)) {
            skippedHistorical += 1
            const historical = historicalTransactions.find(
              (item) => item.providerTransactionId === transaction.providerTransactionId,
            )
            if (historical && historical.bookedAt.getTime() !== transaction.bookedAt.getTime()) {
              bookingDateDrifts += 1
            }
            return
          }
          await upsertBankTransaction({
            db,
            workspaceId: connection.workspaceId,
            connectionId: connection.id,
            accountId: account.id,
            providerAccountId: accountUid,
            transaction,
            workspaceKind: connectionWorkspace.kind,
            now,
          })
          syncedTransactions += 1
        }),
      )
    }
  }

  await db
    .update(bankConnection)
    .set({ status: 'connected', errorMessage: null, lastSyncedAt: now, updatedAt: now })
    .where(eq(bankConnection.id, connection.id))

  return {
    syncedAccounts: accounts.length,
    syncedTransactions,
    skippedHistorical,
    bookingDateDrifts,
    lastSuccessAt: now.toISOString(),
  }
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
  return (
    message.includes('(401)') ||
    message.includes('(403)') ||
    message === 'Bank consent expired' ||
    message === ENABLE_BANKING_NO_ACCOUNTS_ERROR
  )
}

export function shouldDeferBackgroundSync(
  connection: Pick<
    typeof bankConnection.$inferSelect,
    'status' | 'errorMessage' | 'lastSyncedAt' | 'updatedAt'
  >,
  now: Date,
) {
  const lastFetchAt =
    connection.status === 'connected'
      ? connection.lastSyncedAt
      : connection.status === 'error' && connection.errorMessage?.includes(ASPSP_RATE_LIMIT_ERROR)
        ? connection.updatedAt
        : null

  return Boolean(
    lastFetchAt && now.getTime() - lastFetchAt.getTime() < BACKGROUND_FETCH_INTERVAL_MS,
  )
}

export async function retryProvider<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // The bank's background-fetch cap will not clear during an immediate
      // retry. Enable Banking recommends waiting six hours for this error.
      if (
        isConsentFailure(message) ||
        message.includes(ASPSP_RATE_LIMIT_ERROR) ||
        attempt >= PROVIDER_ATTEMPTS
      ) {
        throw error
      }
      const delayMs = message.includes('(429)')
        ? 5_000 * 3 ** (attempt - 1)
        : 250 * 2 ** (attempt - 1)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

type HistoricalTransaction = typeof bankTransaction.$inferSelect

export function matchesHistoricalTransaction(
  transaction: NormalizedEnableBankingTransaction,
  historical: HistoricalTransaction[],
) {
  const sameReference = historical.filter(
    (item) => item.providerTransactionId === transaction.providerTransactionId,
  )
  if (sameReference.length > 0) {
    if (sameReference.length !== 1) {
      throw new Error('A historical bank reference is repeated across account rows')
    }
    if (
      sameReference[0].amount !== transaction.amount ||
      sameReference[0].currency !== transaction.currency
    ) {
      const differences = [
        sameReference[0].amount !== transaction.amount ? 'amount' : null,
        sameReference[0].currency !== transaction.currency ? 'currency' : null,
      ].filter(Boolean)
      throw new Error(`A historical bank reference changed ${differences.join(', ')}`)
    }
    if (
      Math.abs(sameReference[0].bookedAt.getTime() - transaction.bookedAt.getTime()) > 86_400_000
    ) {
      throw new Error('A historical bank reference moved more than one booking day')
    }
    return true
  }

  const candidates = historical.filter((item) => {
    if (
      !sameCoreTransaction(item, transaction) ||
      item.balanceAfterTransaction !== transaction.balanceAfterTransaction
    ) {
      return false
    }
    const payload = item.encryptedPersonalPayload
      ? decryptPersonalTransactionPayload(item.encryptedPersonalPayload)
      : null
    return payload?.description === transaction.description
  })
  if (candidates.length === 0) {
    return false
  }

  const incoming = transaction.rawMetadata as { entry_reference?: string; transaction_id?: string }
  const existing = candidates[0]?.encryptedPersonalPayload
    ? (decryptPersonalTransactionPayload(candidates[0].encryptedPersonalPayload).rawMetadata as {
        entry_reference?: string
        transaction_id?: string
      })
    : null
  if (
    candidates.length !== 1 ||
    transaction.balanceAfterTransaction === null ||
    incoming.entry_reference ||
    incoming.transaction_id ||
    existing?.entry_reference ||
    existing?.transaction_id
  ) {
    throw new Error('Ambiguous transaction overlap across bank consents')
  }
  return true
}

function sameCoreTransaction(
  historical: HistoricalTransaction,
  incoming: NormalizedEnableBankingTransaction,
) {
  return (
    historical.bookedAt.getTime() === incoming.bookedAt.getTime() &&
    historical.amount === incoming.amount &&
    historical.currency === incoming.currency
  )
}

function sameNormalizedTransaction(
  first: NormalizedEnableBankingTransaction,
  second: NormalizedEnableBankingTransaction,
) {
  return (
    first.bookedAt.getTime() === second.bookedAt.getTime() &&
    first.amount === second.amount &&
    first.currency === second.currency &&
    first.description === second.description &&
    first.balanceAfterTransaction === second.balanceAfterTransaction
  )
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
