import { and, desc, eq, gte, inArray, lt, or, type SQL, sql } from 'drizzle-orm'
import {
  bankTransaction,
  createDb,
  type Database,
  decryptPersonalTransactionPayload,
  workspace,
} from '#db'

import { loadSelectedBankAccounts, type SelectedBankAccount } from './bank-accounts'
import {
  type AllBankReadInput,
  allBankReadInputSchema,
  type BankReadInput,
  type ListAllBankTransactionsInput,
  listAllBankTransactionsInputSchema,
} from './bank-schemas'
import { decodeCursor, encodeCursor } from './cursor'

type CategorizedAccount = SelectedBankAccount & {
  workspaceId: string
  workspaceKind: 'personal' | 'business'
}

/** Read-only view of the selected business and personal bank history owned by one user. */
export class AllBankReadService {
  constructor(private readonly db: Database = createDb()) {}

  async listAccounts() {
    const accounts = await this.getAccounts()
    return {
      accounts: accounts.map(
        ({ sourceIds: _sourceIds, workspaceId: _workspaceId, ...account }) => account,
      ),
      asOf: new Date().toISOString(),
    }
  }

  async listTransactions(input: ListAllBankTransactionsInput) {
    const filters = listAllBankTransactionsInputSchema.parse(input)
    const accounts = this.filterAccounts(await this.getAccounts(), filters)
    const asOf = new Date().toISOString()
    const accountFreshness = this.getFreshness(accounts)
    if (accounts.length === 0) {
      return { transactions: [], nextCursor: null, incompletePage: false, asOf, accountFreshness }
    }

    const conditions = this.conditions(accounts, filters)
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
        if (!account || account.workspaceId !== row.workspaceId) {
          throw new Error('Account access changed during the request')
        }
        const personal =
          account.workspaceKind === 'personal'
            ? decryptPersonalTransactionPayload(
                this.requirePersonalPayload(row.encryptedPersonalPayload),
              )
            : null
        return {
          id: row.id,
          accountId: account.id,
          accountName: account.name,
          bankName: account.bankName,
          workspaceKind: account.workspaceKind,
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

  async getTotals(input: AllBankReadInput) {
    const filters = allBankReadInputSchema.parse(input)
    const accounts = this.filterAccounts(await this.getAccounts(), filters)
    const asOf = new Date().toISOString()
    const accountFreshness = this.getFreshness(accounts)
    const groups = new Map<string, CategorizedAccount[]>()
    for (const account of accounts) {
      const key = `${account.workspaceId}:${account.bankName}`
      const group = groups.get(key) ?? []
      group.push(account)
      groups.set(key, group)
    }

    const results = await Promise.all(
      [...groups.values()].map(async (group) => {
        const rows = await this.db
          .select({
            currency: bankTransaction.currency,
            transactionCount: sql<number>`count(*)::int`,
            credits: sql<string>`coalesce(sum(case when ${bankTransaction.amount} > 0 then ${bankTransaction.amount} else 0 end), 0)::numeric(14,2)`,
            debits: sql<string>`coalesce(sum(case when ${bankTransaction.amount} < 0 then ${bankTransaction.amount} else 0 end), 0)::numeric(14,2)`,
            net: sql<string>`coalesce(sum(${bankTransaction.amount}), 0)::numeric(14,2)`,
          })
          .from(bankTransaction)
          .where(and(...this.conditions(group, filters)))
          .groupBy(bankTransaction.currency)
          .orderBy(bankTransaction.currency)

        return rows.map((row) => ({
          ...row,
          bankName: group[0].bankName,
          workspaceKind: group[0].workspaceKind,
        }))
      }),
    )

    return { totals: results.flat(), asOf, accountFreshness }
  }

  private async getAccounts(): Promise<CategorizedAccount[]> {
    const [business] = await this.db
      .select({ id: workspace.id, ownerId: workspace.ownerId })
      .from(workspace)
      .where(eq(workspace.kind, 'business'))
      .orderBy(workspace.createdAt)
      .limit(1)
    if (!business) {
      throw new Error('No business workspace exists')
    }

    const [personal] = await this.db
      .select({ id: workspace.id })
      .from(workspace)
      .where(and(eq(workspace.ownerId, business.ownerId), eq(workspace.kind, 'personal')))
      .limit(1)
    const scopes = [
      { id: business.id, kind: 'business' as const },
      ...(personal ? [{ id: personal.id, kind: 'personal' as const }] : []),
    ]
    const accounts = await Promise.all(
      scopes.map(async ({ id, kind }) =>
        (await loadSelectedBankAccounts(this.db, id, kind)).map((account) => ({
          ...account,
          workspaceId: id,
          workspaceKind: kind,
        })),
      ),
    )
    return accounts
      .flat()
      .sort((a, b) => a.bankName.localeCompare(b.bankName) || a.name.localeCompare(b.name))
  }

  private filterAccounts<
    T extends { accountId?: string; bankName?: string; workspaceKind?: 'personal' | 'business' },
  >(accounts: CategorizedAccount[], filters: T) {
    const bankName = filters.bankName?.trim().toLocaleLowerCase('en')
    return accounts.filter(
      (account) =>
        (!filters.accountId ||
          account.id === filters.accountId ||
          account.sourceIds.includes(filters.accountId)) &&
        (!bankName || account.bankName.toLocaleLowerCase('en') === bankName) &&
        (!filters.workspaceKind || account.workspaceKind === filters.workspaceKind),
    )
  }

  private getFreshness(accounts: CategorizedAccount[]) {
    return accounts.map(({ id, bankName, workspaceKind, lastSyncedAt, connectionStatus }) => ({
      id,
      bankName,
      workspaceKind,
      lastSyncedAt,
      connectionStatus,
    }))
  }

  private conditions(accounts: CategorizedAccount[], filters: BankReadInput): SQL[] {
    const scopeConditions = accounts.map((account) =>
      and(
        eq(bankTransaction.workspaceId, account.workspaceId),
        inArray(bankTransaction.accountId, account.sourceIds),
      ),
    )
    const scopeCondition = or(...scopeConditions)
    if (!scopeCondition) {
      throw new Error('At least one selected account is required')
    }
    const conditions: SQL[] = [scopeCondition, eq(bankTransaction.status, 'booked')]
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
