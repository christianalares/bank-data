import { and, desc, eq, gte, inArray, lt, or, type SQL, sql } from 'drizzle-orm'
import {
  bankTransaction,
  createDb,
  type Database,
  decryptPersonalTransactionPayload,
  workspace,
} from '#db'

import { type BankWorkspaceKind, loadSelectedBankAccounts } from './bank-accounts'
import {
  type BankReadInput,
  bankReadInputSchema,
  type ListBankTransactionsInput,
  listBankTransactionsInputSchema,
} from './bank-schemas'
import { decodeCursor, encodeCursor } from './cursor'

export class BankReadService {
  constructor(
    private readonly kind: BankWorkspaceKind,
    private readonly workspaceId?: string,
    private readonly db: Database = createDb(),
  ) {}

  async listAccounts() {
    const { accounts } = await this.getAccounts()
    return {
      accounts: accounts.map(
        ({ sourceIds: _sourceIds, bankName: _bankName, ...account }) => account,
      ),
      asOf: new Date().toISOString(),
    }
  }

  async listTransactions(input: ListBankTransactionsInput) {
    const filters = listBankTransactionsInputSchema.parse(input)
    const selected = await this.getAccounts()
    const accounts = this.filterAccounts(selected.accounts, filters.accountId)
    const asOf = new Date().toISOString()
    const accountFreshness = this.getFreshness(accounts)
    const accountIds = accounts.flatMap((account) => account.sourceIds)
    if (accountIds.length === 0) {
      return { transactions: [], nextCursor: null, incompletePage: false, asOf, accountFreshness }
    }

    const conditions = this.conditions(selected.workspaceId, accountIds, filters)
    if (filters.cursor) {
      const cursor = decodeCursor(filters.cursor)
      const cursorDate = new Date(cursor.timestamp)
      const cursorCondition = or(
        lt(bankTransaction.bookedAt, cursorDate),
        and(eq(bankTransaction.bookedAt, cursorDate), lt(bankTransaction.id, cursor.id)),
      )
      if (cursorCondition) {
        conditions.push(cursorCondition)
      }
    }

    const rows = await this.db.query.bankTransaction.findMany({
      where: and(...conditions),
      orderBy: [desc(bankTransaction.bookedAt), desc(bankTransaction.id)],
      limit: filters.limit + 1,
    })
    const incompletePage = rows.length > filters.limit
    const page = rows.slice(0, filters.limit)
    const accountBySourceId = new Map(
      accounts.flatMap((account) => account.sourceIds.map((id) => [id, account] as const)),
    )

    return {
      transactions: page.map((row) => {
        const account = accountBySourceId.get(row.accountId)
        if (!account) {
          throw new Error('Account access changed during the request')
        }
        const personal =
          this.kind === 'personal'
            ? decryptPersonalTransactionPayload(
                this.requirePersonalPayload(row.encryptedPersonalPayload),
              )
            : null
        return {
          id: row.id,
          accountId: account.id,
          accountName: account.name,
          bookedAt: row.bookedAt.toISOString(),
          amount: row.amount,
          currency: row.currency,
          description: personal?.description ?? row.description,
          merchantName: personal?.merchantOverride ?? personal?.merchantName ?? row.merchantName,
          counterpartyName: personal?.counterpartyName ?? row.counterpartyName,
          status: 'booked' as const,
        }
      }),
      nextCursor:
        incompletePage && page.length > 0
          ? encodeCursor({
              timestamp: page[page.length - 1].bookedAt.toISOString(),
              id: page[page.length - 1].id,
            })
          : null,
      incompletePage,
      asOf,
      accountFreshness,
    }
  }

  async getTotals(input: BankReadInput) {
    const filters = bankReadInputSchema.parse(input)
    const selected = await this.getAccounts()
    const accounts = this.filterAccounts(selected.accounts, filters.accountId)
    const asOf = new Date().toISOString()
    const accountFreshness = this.getFreshness(accounts)
    const accountIds = accounts.flatMap((account) => account.sourceIds)
    if (accountIds.length === 0) {
      return { totals: [], asOf, accountFreshness }
    }

    const rows = await this.db
      .select({
        currency: bankTransaction.currency,
        transactionCount: sql<number>`count(*)::int`,
        credits: sql<string>`coalesce(sum(case when ${bankTransaction.amount} > 0 then ${bankTransaction.amount} else 0 end), 0)::numeric(14,2)`,
        debits: sql<string>`coalesce(sum(case when ${bankTransaction.amount} < 0 then ${bankTransaction.amount} else 0 end), 0)::numeric(14,2)`,
        net: sql<string>`coalesce(sum(${bankTransaction.amount}), 0)::numeric(14,2)`,
      })
      .from(bankTransaction)
      .where(and(...this.conditions(selected.workspaceId, accountIds, filters)))
      .groupBy(bankTransaction.currency)
      .orderBy(bankTransaction.currency)

    return { totals: rows, asOf, accountFreshness }
  }

  private async getAccounts() {
    const workspaceId = this.workspaceId ?? (await this.getBusinessWorkspaceId())
    const accounts = await loadSelectedBankAccounts(this.db, workspaceId, this.kind)
    return { workspaceId, accounts }
  }

  private async getBusinessWorkspaceId() {
    const [row] = await this.db
      .select({ id: workspace.id })
      .from(workspace)
      .where(eq(workspace.kind, 'business'))
      .orderBy(workspace.createdAt)
      .limit(1)
    if (!row) {
      throw new Error('No business workspace exists')
    }
    return row.id
  }

  private filterAccounts<T extends { id: string; sourceIds: string[] }>(
    accounts: T[],
    id?: string,
  ) {
    if (!id) {
      return accounts
    }
    return accounts.filter((account) => account.id === id || account.sourceIds.includes(id))
  }

  private getFreshness(
    accounts: Array<{ id: string; lastSyncedAt: string | null; connectionStatus: string }>,
  ) {
    return accounts.map(({ id, lastSyncedAt, connectionStatus }) => ({
      id,
      lastSyncedAt,
      connectionStatus,
    }))
  }

  private conditions(workspaceId: string, accountIds: string[], filters: BankReadInput): SQL[] {
    const conditions: SQL[] = [
      eq(bankTransaction.workspaceId, workspaceId),
      inArray(bankTransaction.accountId, accountIds),
      eq(bankTransaction.status, 'booked'),
    ]
    if (filters.dateFrom) {
      conditions.push(gte(bankTransaction.bookedAt, new Date(`${filters.dateFrom}T00:00:00.000Z`)))
    }
    if (filters.dateTo) {
      const exclusiveEnd = new Date(`${filters.dateTo}T00:00:00.000Z`)
      exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1)
      conditions.push(lt(bankTransaction.bookedAt, exclusiveEnd))
    }
    return conditions
  }

  private requirePersonalPayload(payload: string | null) {
    if (!payload) {
      throw new Error('Personal transaction payload is unavailable')
    }
    return payload
  }
}
