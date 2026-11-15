import { type bankAccount, bankUpcomingSnapshot, type Database } from '#db'
import { bankFetchContext } from '../banking/fetch-context'
import { EnableBankingRequestError, providerFailure } from '../banking/provider-error'
import {
  getEnableBankingPreliminaryTransactions,
  UpcomingPaymentsReadError,
} from '../banking/upcoming-payments'
import { loadSelectedBankAccounts } from '../finance/bank-accounts'
import { resolveBusinessPaymentSource } from '../finance/upcoming-payment-source'
import { recordBankFetchFailure } from './fetch-coordinator'

export async function refreshBusinessUpcomingObservations(
  db: Database,
  account: typeof bankAccount.$inferSelect,
) {
  if (!bankFetchContext.current())
    throw new Error('Preliminary observations require a coordinated bank sync')
  if (!account.included) return
  const selected = await loadSelectedBankAccounts(db, account.workspaceId, 'business')
  const canonical = selected.find((a) => a.sourceIds.includes(account.id))
  if (!canonical) return
  const source = await resolveBusinessPaymentSource(db, account.workspaceId, canonical.id)
  // Historical aliases must not cause extra requests or become the current source.
  if (source.id !== account.id || source.connectionId !== account.connectionId) return
  const assertSource = async () => {
    const current = await resolveBusinessPaymentSource(db, account.workspaceId, canonical.id)
    if (
      current.id !== source.id ||
      current.connectionId !== source.connectionId ||
      current.providerAccountId !== source.providerAccountId
    ) {
      throw new UpcomingPaymentsReadError(
        'Account access changed during the request',
        providerFailure('authorization_changed'),
      )
    }
  }
  const start = new Date()
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 92)
  const dateFrom = start.toISOString().slice(0, 10)
  const dateTo = end.toISOString().slice(0, 10)
  const result = await getEnableBankingPreliminaryTransactions(source.providerAccountId, {
    dateFrom,
    dateTo,
    authorize: assertSource,
  })
  const excludedStatuses = new Map<string | null, number>()
  let excludedByValueDateCount = 0
  const entries = result.entries.filter(({ transaction: t }) => {
    if (t.status !== 'PDNG' && t.status !== 'SCHD') {
      const status = t.status ?? null
      excludedStatuses.set(status, (excludedStatuses.get(status) ?? 0) + 1)
      return false
    }
    if (t.value_date && (t.value_date < dateFrom || t.value_date > dateTo)) {
      excludedByValueDateCount += 1
      return false
    }
    return true
  })
  await assertSource()
  await db.insert(bankUpcomingSnapshot).values({
    workspaceId: account.workspaceId,
    accountId: account.id,
    connectionId: source.connectionId,
    providerAccountId: source.providerAccountId,
    dateFrom,
    dateTo,
    startedAt: new Date(result.retrieval.startedAt),
    retrievedAt: result.retrieval.retrievedAt ? new Date(result.retrieval.retrievedAt) : null,
    complete: result.retrieval.complete,
    pagesRetrieved: result.retrieval.pagesRetrieved,
    incompleteReason: result.retrieval.incompleteReason,
    failure: result.failure,
    entries,
    excludedStatusCounts: [...excludedStatuses].map(([providerStatus, count]) => ({
      providerStatus,
      count,
    })),
    excludedByValueDateCount,
  })
  if (result.failure) {
    await recordBankFetchFailure(db, account.workspaceId, result.failure)
    throw new EnableBankingRequestError(
      'Preliminary bank observation refresh was incomplete',
      true,
      result.failure,
    )
  }
}
