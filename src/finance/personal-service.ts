import { and, desc, eq, gte, inArray, lt, lte, or, type SQL } from 'drizzle-orm'
import { searchPersonalTransactionVectors } from '#banking'
import {
  bankAccount,
  bankTransaction,
  createDb,
  createPersonalSearchToken,
  type Database,
  decryptPersonalAccountPayload,
  decryptPersonalTransactionPayload,
  getPersonalAccountDisplayName,
  personalTransactionSearchToken,
  tokenizePersonalSearchText,
} from '#db'

import { decodeCursor, encodeCursor } from './cursor'
import {
  type PersonalSpendingSummaryInput,
  personalSpendingSummaryInputSchema,
  type SearchPersonalTransactionsInput,
  searchPersonalTransactionsInputSchema,
} from './personal-schemas'

export class PersonalFinanceService {
  private readonly db: Database
  private readonly workspaceId: string

  constructor({ workspaceId, db = createDb() }: { workspaceId: string; db?: Database }) {
    this.workspaceId = workspaceId
    this.db = db
  }

  async listAccounts() {
    const accounts = await this.db.query.bankAccount.findMany({
      where: (table, { and, eq }) =>
        and(eq(table.workspaceId, this.workspaceId), eq(table.included, true)),
      orderBy: (table, { asc }) => [asc(table.name)],
    })

    return {
      accounts: accounts.map((account) => {
        const payload = account.encryptedPersonalPayload
          ? decryptPersonalAccountPayload(account.encryptedPersonalPayload)
          : { name: account.name }

        return {
          id: account.id,
          name: getPersonalAccountDisplayName(payload),
          currency: account.currency,
          currentBalance: account.currentBalance,
          availableBalance: account.availableBalance,
          updatedAt: account.updatedAt.toISOString(),
        }
      }),
    }
  }

  async searchTransactions(input: SearchPersonalTransactionsInput) {
    const filters = searchPersonalTransactionsInputSchema.parse(input)
    const accountIds = await this.getIncludedAccountIds(filters.accountId)

    if (accountIds.length === 0) {
      return { transactions: [], nextCursor: null }
    }

    const matchingIds = await this.findMatchingTransactionIds(filters.query)
    if (matchingIds?.length === 0) {
      return { transactions: [], nextCursor: null }
    }

    const conditions = this.getTransactionConditions({
      ...filters,
      accountIds,
      matchingIds,
    })

    if (filters.cursor) {
      const cursor = decodeCursor(filters.cursor)
      const cursorDate = new Date(cursor.timestamp)
      conditions.push(
        or(
          lt(bankTransaction.bookedAt, cursorDate),
          and(eq(bankTransaction.bookedAt, cursorDate), lt(bankTransaction.id, cursor.id)),
        ),
      )
    }

    const rows = await this.db
      .select({
        transaction: bankTransaction,
        accountName: bankAccount.name,
        accountEncryptedPayload: bankAccount.encryptedPersonalPayload,
      })
      .from(bankTransaction)
      .innerJoin(bankAccount, eq(bankTransaction.accountId, bankAccount.id))
      .where(and(...conditions))
      .orderBy(desc(bankTransaction.bookedAt), desc(bankTransaction.id))
      .limit(filters.limit + 1)
    const hasMore = rows.length > filters.limit
    const pageRows = hasMore ? rows.slice(0, filters.limit) : rows
    const lastRow = pageRows.at(-1)

    return {
      transactions: pageRows.map(({ transaction, accountName, accountEncryptedPayload }) => {
        const resolvedAccountName = accountEncryptedPayload
          ? getPersonalAccountDisplayName(decryptPersonalAccountPayload(accountEncryptedPayload))
          : accountName

        return serializePersonalTransaction(transaction, resolvedAccountName)
      }),
      nextCursor:
        hasMore && lastRow
          ? encodeCursor({
              timestamp: lastRow.transaction.bookedAt.toISOString(),
              id: lastRow.transaction.id,
            })
          : null,
    }
  }

  async getSpendingSummary(input: PersonalSpendingSummaryInput) {
    const filters = personalSpendingSummaryInputSchema.parse(input)
    const accountIds = await this.getIncludedAccountIds(filters.accountId)

    if (accountIds.length === 0) {
      return { totals: [] }
    }

    const matchingIds = await this.findMatchingTransactionIds(filters.query)
    if (matchingIds?.length === 0) {
      return { totals: [] }
    }

    const rows = await this.db.query.bankTransaction.findMany({
      where: and(
        ...this.getTransactionConditions({
          ...filters,
          direction: undefined,
          amountMin: undefined,
          amountMax: undefined,
          accountIds,
          matchingIds,
        }),
      ),
      columns: {
        amount: true,
        currency: true,
        encryptedPersonalPayload: true,
      },
    })
    const debitKeys = new Set(
      rows
        .filter((row) => Number(row.amount) < 0)
        .map((row) => getRefundKey(row.encryptedPersonalPayload))
        .filter((key): key is string => Boolean(key)),
    )
    const byCurrency = new Map<
      string,
      { grossSpent: number; refunds: number; transactionCount: number }
    >()

    for (const row of rows) {
      const summary = byCurrency.get(row.currency) ?? {
        grossSpent: 0,
        refunds: 0,
        transactionCount: 0,
      }
      const amount = Number(row.amount)
      if (amount < 0) {
        summary.grossSpent += Math.abs(amount)
        summary.transactionCount += 1
      } else if (isLikelyRefund(row.encryptedPersonalPayload, debitKeys)) {
        summary.refunds += amount
        summary.transactionCount += 1
      }
      byCurrency.set(row.currency, summary)
    }

    return {
      totals: [...byCurrency.entries()]
        .filter(([, summary]) => summary.transactionCount > 0)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([currency, summary]) => ({
          currency,
          grossSpent: summary.grossSpent.toFixed(2),
          refunds: summary.refunds.toFixed(2),
          netSpent: (summary.grossSpent - summary.refunds).toFixed(2),
          transactionCount: summary.transactionCount,
        })),
    }
  }

  private async getIncludedAccountIds(accountId?: string) {
    const rows = await this.db.query.bankAccount.findMany({
      where: (table, { and, eq }) =>
        and(
          eq(table.workspaceId, this.workspaceId),
          eq(table.included, true),
          accountId ? eq(table.id, accountId) : undefined,
        ),
      columns: { id: true },
    })

    return rows.map((row) => row.id)
  }

  private async findMatchingTransactionIds(query?: string) {
    if (!query) {
      return undefined
    }

    const tokenHashes = tokenizePersonalSearchText(query).map(createPersonalSearchToken)
    const [exactRows, vectorRows] = await Promise.all([
      tokenHashes.length > 0
        ? this.db
            .select({ transactionId: personalTransactionSearchToken.transactionId })
            .from(personalTransactionSearchToken)
            .where(
              and(
                eq(personalTransactionSearchToken.workspaceId, this.workspaceId),
                inArray(personalTransactionSearchToken.tokenHash, tokenHashes),
              ),
            )
        : Promise.resolve([]),
      searchPersonalTransactionVectors({
        query,
        workspaceId: this.workspaceId,
        limit: 100,
      }).catch(() => []),
    ])

    return [
      ...new Set([
        ...exactRows.map((row) => row.transactionId),
        ...vectorRows.map((row) => row.id),
      ]),
    ]
  }

  private getTransactionConditions({
    accountIds,
    matchingIds,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
    currency,
    direction,
    includeInternalTransfers,
  }: {
    accountIds: string[]
    matchingIds?: string[]
    dateFrom?: string
    dateTo?: string
    amountMin?: number
    amountMax?: number
    currency?: string
    direction?: 'credit' | 'debit'
    includeInternalTransfers: boolean
  }) {
    const conditions: Array<SQL | undefined> = [
      eq(bankTransaction.workspaceId, this.workspaceId),
      inArray(bankTransaction.accountId, accountIds),
      matchingIds ? inArray(bankTransaction.id, matchingIds) : undefined,
      dateFrom ? gte(bankTransaction.bookedAt, startOfUtcDay(dateFrom)) : undefined,
      dateTo ? lt(bankTransaction.bookedAt, startOfNextUtcDay(dateTo)) : undefined,
      amountMin === undefined ? undefined : gte(bankTransaction.amount, amountMin.toString()),
      amountMax === undefined ? undefined : lte(bankTransaction.amount, amountMax.toString()),
      currency ? eq(bankTransaction.currency, currency) : undefined,
      direction === 'credit' ? gte(bankTransaction.amount, '0') : undefined,
      direction === 'debit' ? lt(bankTransaction.amount, '0') : undefined,
      includeInternalTransfers ? undefined : eq(bankTransaction.transferState, 'ordinary'),
    ]

    return conditions
  }
}

function serializePersonalTransaction(
  transaction: typeof bankTransaction.$inferSelect,
  accountName: string,
) {
  if (!transaction.encryptedPersonalPayload) {
    throw new Error('Personal transaction payload is unavailable')
  }

  const payload = decryptPersonalTransactionPayload(transaction.encryptedPersonalPayload)

  return {
    id: transaction.id,
    accountId: transaction.accountId,
    accountName,
    bookedAt: transaction.bookedAt.toISOString(),
    amount: transaction.amount,
    currency: transaction.currency,
    description: payload.description,
    merchantName: payload.merchantOverride ?? payload.merchantName,
    counterpartyName: payload.counterpartyName,
    note: payload.noteOverride ?? payload.note,
    status: transaction.status,
    transferState: transaction.transferState,
    transferPairId: transaction.transferPairId,
  }
}

function startOfUtcDay(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

function startOfNextUtcDay(value: string) {
  const date = startOfUtcDay(value)
  date.setUTCDate(date.getUTCDate() + 1)
  return date
}

function isLikelyRefund(encryptedPayload: string | null, debitKeys: Set<string>) {
  if (!encryptedPayload) {
    return false
  }

  const payload = decryptPersonalTransactionPayload(encryptedPayload)
  const text = [
    payload.merchantOverride,
    payload.merchantName,
    payload.counterpartyName,
    payload.description,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    /\b(refund|refunded|reversal|return|återbetalning|återköp|retur)\b/i.test(text) ||
    debitKeys.has(getRefundKey(encryptedPayload) ?? '')
  )
}

function getRefundKey(encryptedPayload: string | null) {
  if (!encryptedPayload) {
    return null
  }

  const payload = decryptPersonalTransactionPayload(encryptedPayload)
  const value = payload.merchantOverride ?? payload.merchantName ?? payload.counterpartyName ?? null

  return value
    ?.normalize('NFKC')
    .toLocaleLowerCase('sv-SE')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}
