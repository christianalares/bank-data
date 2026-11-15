import { and, desc, eq } from 'drizzle-orm'
import { bankFetchState, bankUpcomingSnapshot, createDb, type Database } from '#db'
import { UpcomingPaymentsReadError } from '../banking/upcoming-payments'
import { BACKGROUND_FETCH_INTERVAL_MS } from '../sync/fetch-coordinator'
import {
  type ListBusinessUpcomingPaymentsInput,
  listBusinessUpcomingPaymentsInputSchema,
} from './upcoming-payment-schemas'
import { resolveBusinessPaymentSource } from './upcoming-payment-source'

export class BusinessUpcomingPaymentService {
  constructor(
    private readonly db: Database = createDb(),
    private readonly workspaceId = process.env.BANK_CONSENT_BUSINESS_WORKSPACE_ID,
  ) {}

  async listPayments(input: ListBusinessUpcomingPaymentsInput) {
    const filters = listBusinessUpcomingPaymentsInputSchema.parse(input)
    const source = await resolveBusinessPaymentSource(this.db, this.workspaceId, filters.accountId)
    const conditions = and(
      eq(bankUpcomingSnapshot.workspaceId, this.workspaceId!),
      eq(bankUpcomingSnapshot.accountId, source.id),
      eq(bankUpcomingSnapshot.connectionId, source.connectionId),
      eq(bankUpcomingSnapshot.providerAccountId, source.providerAccountId),
    )
    const [snapshot, attempt, fetchState] = await Promise.all([
      this.db.query.bankUpcomingSnapshot.findFirst({
        where: and(conditions, eq(bankUpcomingSnapshot.complete, true)),
        orderBy: [desc(bankUpcomingSnapshot.storedAt), desc(bankUpcomingSnapshot.id)],
      }),
      this.db.query.bankUpcomingSnapshot.findFirst({
        where: conditions,
        orderBy: [desc(bankUpcomingSnapshot.storedAt), desc(bankUpcomingSnapshot.id)],
      }),
      this.db.query.bankFetchState.findFirst({
        where: eq(bankFetchState.workspaceId, this.workspaceId!),
      }),
    ])
    const current = await resolveBusinessPaymentSource(this.db, this.workspaceId, filters.accountId)
    if (
      current.id !== source.id ||
      current.connectionId !== source.connectionId ||
      current.providerAccountId !== source.providerAccountId
    )
      throw new UpcomingPaymentsReadError('Account access changed during the request')
    const result = {
      entries: snapshot?.entries ?? [],
      retrieval: snapshot
        ? {
            startedAt: snapshot.startedAt.toISOString(),
            retrievedAt: snapshot.retrievedAt?.toISOString() ?? null,
            pagesRetrieved: snapshot.pagesRetrieved,
            complete: snapshot.complete,
            incompleteReason: snapshot.incompleteReason,
          }
        : null,
    }
    const now = new Date()
    const ageSeconds = snapshot?.retrievedAt
      ? Math.max(0, Math.floor((now.getTime() - snapshot.retrievedAt.getTime()) / 1000))
      : null
    const requestedRangeCovered = Boolean(
      snapshot && snapshot.dateFrom <= filters.dateFrom && snapshot.dateTo >= filters.dateTo,
    )
    const failure = fetchState?.failure ?? attempt?.failure ?? null
    const excludedStatuses = new Map<string | null, number>(
      snapshot?.excludedStatusCounts.map((r) => [r.providerStatus, r.count]) ?? [],
    )
    let excludedByValueDateCount = snapshot?.excludedByValueDateCount ?? 0
    const entries = result.entries.flatMap(({ transaction: t, retrievedAt }) => {
      if (t.status !== 'PDNG' && t.status !== 'SCHD') {
        const status = t.status ?? null
        excludedStatuses.set(status, (excludedStatuses.get(status) ?? 0) + 1)
        return []
      }
      if (t.value_date && (t.value_date < filters.dateFrom || t.value_date > filters.dateTo)) {
        excludedByValueDateCount += 1
        return []
      }
      return [
        {
          accountId: source.account.id,
          accountName: source.account.name,
          bankName: source.account.bankName,
          amount: t.transaction_amount?.amount ?? null,
          currency: t.transaction_amount?.currency ?? null,
          creditDebitIndicator: t.credit_debit_indicator ?? null,
          creditorName: t.creditor?.name ?? null,
          creditorAccount: t.creditor_account
            ? {
                iban: t.creditor_account.iban ?? null,
                other: normalizeIdentification(t.creditor_account.other),
              }
            : null,
          creditorAccountAdditionalIdentification: normalizeIdentification(
            t.creditor_account_additional_identification,
          ),
          referenceNumber: t.reference_number ?? null,
          referenceNumberSchema: t.reference_number_schema ?? null,
          remittanceInformation: t.remittance_information ?? null,
          providerStatus: t.status,
          valueDate: t.value_date ?? null,
          bookingDate: t.booking_date ?? null,
          transactionDate: t.transaction_date ?? null,
          dateRangeMatch: t.value_date ? ('value_date' as const) : ('unknown' as const),
          providerTransactionId: t.transaction_id ?? null,
          entryReference: t.entry_reference ?? null,
          note: t.note ?? null,
          merchantCategoryCode: t.merchant_category_code ?? null,
          bankTransactionCode: t.bank_transaction_code
            ? {
                code: t.bank_transaction_code.code ?? null,
                subCode: t.bank_transaction_code.sub_code ?? null,
                description: t.bank_transaction_code.description ?? null,
              }
            : null,
          signingStatus: 'not_provided' as const,
          retrievedAt,
        },
      ]
    })
    return {
      entries,
      dateFilter: {
        field: 'value_date' as const,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        undatedEntries: 'included_with_unknown_match' as const,
      },
      excludedStatusCounts: [...excludedStatuses].map(([providerStatus, count]) => ({
        providerStatus,
        count,
      })),
      excludedByValueDateCount,
      retrieval: result.retrieval,
      observation: {
        dataAvailable: Boolean(snapshot),
        snapshotId: snapshot?.id ?? null,
        dateFrom: snapshot?.dateFrom ?? null,
        dateTo: snapshot?.dateTo ?? null,
        ageSeconds,
        requestedRangeCovered,
        stale:
          ageSeconds === null ||
          ageSeconds * 1000 >= BACKGROUND_FETCH_INTERVAL_MS ||
          !requestedRangeCovered ||
          Boolean(failure),
      },
      refresh: {
        scope: 'workspace' as const,
        lastAttemptAt:
          fetchState?.lastAttemptAt?.toISOString() ?? attempt?.startedAt.toISOString() ?? null,
        lastFinishedAt: fetchState?.lastFinishedAt?.toISOString() ?? null,
        lastAttemptComplete:
          fetchState?.lastAttemptAt && (!attempt || fetchState.lastAttemptAt > attempt.startedAt)
            ? failure
              ? false
              : null
            : (attempt?.complete ?? null),
        lastObservationAttempt: attempt
          ? {
              dateFrom: attempt.dateFrom,
              dateTo: attempt.dateTo,
              startedAt: attempt.startedAt.toISOString(),
              retrievedAt: attempt.retrievedAt?.toISOString() ?? null,
              complete: attempt.complete,
              pagesRetrieved: attempt.pagesRetrieved,
              incompleteReason: attempt.incompleteReason,
              failure: attempt.failure,
            }
          : null,
        failure,
        nextAllowedAt: fetchState?.nextAllowedAt?.toISOString() ?? null,
        inProgress: Boolean(fetchState?.leaseUntil && fetchState.leaseUntil > now),
        blocked: Boolean(fetchState?.nextAllowedAt && fetchState.nextAllowedAt > now),
      },
      instructionCoverage: 'not_guaranteed' as const,
    }
  }
}

function normalizeIdentification(
  source:
    | { identification?: string | null; scheme_name?: string | null; issuer?: string | null }
    | null
    | undefined,
) {
  return source
    ? {
        identification: source.identification ?? null,
        schemeName: source.scheme_name ?? null,
        issuer: source.issuer ?? null,
      }
    : null
}
