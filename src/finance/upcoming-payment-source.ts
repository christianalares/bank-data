import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { bankAccount, bankConnection, type Database, workspace } from '#db'
import { providerFailure } from '../banking/provider-error'
import { UpcomingPaymentsReadError } from '../banking/upcoming-payments'
import { loadSelectedBankAccounts } from './bank-accounts'

export async function resolveBusinessPaymentSource(
  db: Database,
  workspaceId: string | undefined,
  accountId: string,
) {
  const id = z.string().uuid().safeParse(workspaceId)
  if (!id.success)
    throw new UpcomingPaymentsReadError('Configured business workspace is unavailable')
  const [owner] = await db
    .select({ id: workspace.id })
    .from(workspace)
    .where(and(eq(workspace.id, id.data), eq(workspace.kind, 'business')))
    .limit(1)
  if (!owner) throw new UpcomingPaymentsReadError('Configured business workspace is unavailable')

  const accounts = await loadSelectedBankAccounts(db, id.data, 'business')
  const account = accounts.find((a) => a.id === accountId)
  if (!account) throw new UpcomingPaymentsReadError('Selected business account is unavailable')

  const rows = await db
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
        inArray(bankConnection.status, ['connected', 'error']),
      ),
    )
  rows.sort((a, b) => account.sourceIds.indexOf(a.id) - account.sourceIds.indexOf(b.id))
  const current = rows[0]
  if (
    !current ||
    !current.providerAccountId ||
    (current.consentValidUntil && current.consentValidUntil.getTime() <= Date.now())
  ) {
    throw new UpcomingPaymentsReadError(
      'Business bank connection is unavailable or expired',
      providerFailure('consent_expired'),
    )
  }
  return { ...current, account }
}
