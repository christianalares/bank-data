import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { bankAccount, bankConnection, createDb, type Database, workspace } from '#db'
import {
  getEnableBankingPreliminaryTransactions,
  UpcomingPaymentsReadError,
} from '../banking/upcoming-payments'
import { loadSelectedBankAccounts } from './bank-accounts'
import {
  type ListBusinessUpcomingPaymentsInput,
  listBusinessUpcomingPaymentsInputSchema,
} from './upcoming-payment-schemas'

export class BusinessUpcomingPaymentService {
  constructor(
    private readonly db: Database = createDb(),
    private readonly workspaceId = process.env.BANK_CONSENT_BUSINESS_WORKSPACE_ID,
  ) {}

  async listPayments(input: ListBusinessUpcomingPaymentsInput) {
    const filters = listBusinessUpcomingPaymentsInputSchema.parse(input)
    const source = await this.source(filters.accountId)
    const result = await getEnableBankingPreliminaryTransactions(source.providerAccountId, {
      ...filters,
      authorize: async () => {
        const current = await this.source(filters.accountId)
        if (
          current.providerAccountId !== source.providerAccountId ||
          current.connectionId !== source.connectionId
        ) {
          throw new UpcomingPaymentsReadError('Account access changed during the request')
        }
      },
    })
    const excludedStatuses = new Map<string | null, number>()
    let excludedByValueDateCount = 0
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
      instructionCoverage: 'not_guaranteed' as const,
    }
  }

  private async source(accountId: string) {
    const id = z.string().uuid().safeParse(this.workspaceId)
    if (!id.success)
      throw new UpcomingPaymentsReadError('Configured business workspace is unavailable')
    const [owner] = await this.db
      .select({ id: workspace.id })
      .from(workspace)
      .where(and(eq(workspace.id, id.data), eq(workspace.kind, 'business')))
      .limit(1)
    if (!owner) throw new UpcomingPaymentsReadError('Configured business workspace is unavailable')

    const accounts = await loadSelectedBankAccounts(this.db, id.data, 'business')
    const account = accounts.find((a) => a.id === accountId)
    if (!account) throw new UpcomingPaymentsReadError('Selected business account is unavailable')

    const rows = await this.db
      .select({
        id: bankAccount.id,
        providerAccountId: bankAccount.providerAccountId,
        connectionId: bankConnection.id,
        consentValidUntil: bankConnection.consentValidUntil,
      })
      .from(bankAccount)
      .innerJoin(bankConnection, eq(bankAccount.connectionId, bankConnection.id))
      .where(
        and(
          eq(bankAccount.workspaceId, id.data),
          eq(bankAccount.included, true),
          inArray(bankAccount.id, account.sourceIds),
          eq(bankConnection.workspaceId, id.data),
          eq(bankConnection.provider, 'enable_banking'),
          eq(bankConnection.status, 'connected'),
        ),
      )
    rows.sort((a, b) => account.sourceIds.indexOf(a.id) - account.sourceIds.indexOf(b.id))
    const current = rows[0]
    if (
      !current ||
      !current.providerAccountId ||
      (current.consentValidUntil && current.consentValidUntil.getTime() <= Date.now())
    ) {
      throw new UpcomingPaymentsReadError('Business bank connection is unavailable or expired')
    }
    return { ...current, account }
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
