import { and, eq } from 'drizzle-orm'
import {
  bankAccount,
  bankConnection,
  type Database,
  decryptPersonalAccountPayload,
  getPersonalAccountDisplayName,
} from '#db'

export type BankWorkspaceKind = 'personal' | 'business'

export type SelectedBankAccount = {
  id: string
  sourceIds: string[]
  bankName: string
  name: string
  currency: string
  currentBalance: string | null
  availableBalance: string | null
  updatedAt: string
  lastSyncedAt: string | null
  connectionStatus: 'connected' | 'error' | 'pending' | 'disconnected'
}

export async function loadSelectedBankAccounts(
  db: Database,
  workspaceId: string,
  kind: BankWorkspaceKind,
): Promise<SelectedBankAccount[]> {
  const rows = await db
    .select({ account: bankAccount, connection: bankConnection })
    .from(bankAccount)
    .innerJoin(bankConnection, eq(bankAccount.connectionId, bankConnection.id))
    .where(and(eq(bankAccount.workspaceId, workspaceId), eq(bankAccount.included, true)))

  const groups = new Map<string, typeof rows>()

  for (const row of rows) {
    const payload =
      kind === 'personal' && row.account.encryptedPersonalPayload
        ? decryptPersonalAccountPayload(row.account.encryptedPersonalPayload)
        : null
    const iban = (kind === 'personal' ? payload?.iban : row.account.iban)
      ?.replace(/\s+/g, '')
      .toUpperCase()
    const key = iban ? `${row.account.currency}:${iban}` : row.account.id
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }

  return [...groups.values()]
    .map((group) => {
      const canonical = [...group].sort(
        (left, right) =>
          left.account.createdAt.getTime() - right.account.createdAt.getTime() ||
          left.account.id.localeCompare(right.account.id),
      )[0]
      group.sort((left, right) => {
        const rank = { connected: 0, error: 1, pending: 2, disconnected: 3 }
        return (
          rank[left.connection.status] - rank[right.connection.status] ||
          right.account.createdAt.getTime() - left.account.createdAt.getTime()
        )
      })
      const primary = group[0]
      const bankName = getBankName(primary.connection)
      const payloads =
        kind === 'personal'
          ? group.map(({ account }) =>
              account.encryptedPersonalPayload
                ? decryptPersonalAccountPayload(account.encryptedPersonalPayload)
                : { name: account.name, nameOverride: null },
            )
          : []
      const override = payloads.find((payload) => payload.nameOverride?.trim())?.nameOverride
      const name =
        kind === 'personal'
          ? getPersonalAccountDisplayName({ name: payloads[0].name, nameOverride: override })
          : primary.account.name

      return {
        id: canonical.account.id,
        sourceIds: group.map(({ account }) => account.id),
        bankName,
        name,
        currency: primary.account.currency,
        currentBalance: primary.account.currentBalance,
        availableBalance: primary.account.availableBalance,
        updatedAt: primary.account.updatedAt.toISOString(),
        lastSyncedAt: primary.connection.lastSyncedAt?.toISOString() ?? null,
        connectionStatus: primary.connection.status,
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
}

function getBankName(connection: { name: string; rawMetadata: unknown }) {
  const metadata = connection.rawMetadata as { aspsp?: { name?: unknown } } | null
  const aspspName = metadata?.aspsp?.name
  if (typeof aspspName === 'string' && aspspName.trim()) {
    return aspspName.trim()
  }

  return connection.name.replace(/^Enable Banking /, '').trim()
}
