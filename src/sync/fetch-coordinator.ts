import { eq, sql } from 'drizzle-orm'
import { bankFetchState, type Database } from '#db'
import { bankFetchContext } from '../banking/fetch-context'
import { EnableBankingRequestError, type ProviderFailure } from '../banking/provider-error'

export const BACKGROUND_FETCH_INTERVAL_MS = 6 * 60 * 60 * 1000

export async function recordBankFetchFailure(
  db: Database,
  workspaceId: string,
  failure: ProviderFailure,
) {
  const seconds = Math.max(BACKGROUND_FETCH_INTERVAL_MS / 1000, failure.retryAfterSeconds ?? 0)
  await db
    .update(bankFetchState)
    .set({
      failure,
      ...(failure.kind === 'rate_limited'
        ? {
            nextAllowedAt: sql`greatest(${bankFetchState.nextAllowedAt}, clock_timestamp() + ${seconds} * interval '1 second')`,
          }
        : {}),
    })
    .where(eq(bankFetchState.workspaceId, workspaceId))
}

/** The advisory lock serializes instances; committed state survives crashes.
 * Scope is deliberately conservative: all bank sync refreshes in one workspace
 * share a budget, including aliases and renewed consents. MCP does no fetching.
 */
export async function withCoordinatedBankFetch<T>(
  db: Database,
  workspaceId: string,
  initialNextAllowedAt: Date | null,
  operation: () => Promise<T>,
) {
  return db.transaction(async (lock) => {
    const rows = await lock.execute(
      sql`select pg_try_advisory_xact_lock(hashtextextended(${`enable-banking:${workspaceId}`}, 0)) as acquired`,
    )
    if (!rows[0]?.acquired) return { deferred: true as const, reason: 'in_progress' as const }

    await db
      .insert(bankFetchState)
      .values({ workspaceId, nextAllowedAt: initialNextAllowedAt ?? new Date() })
      .onConflictDoNothing()
    const claimed = await db
      .update(bankFetchState)
      .set({
        lastAttemptAt: sql`clock_timestamp()`,
        lastFinishedAt: null,
        nextAllowedAt: sql`clock_timestamp() + interval '6 hours'`,
        leaseUntil: sql`clock_timestamp() + interval '2 minutes'`,
        failure: null,
      })
      .where(
        sql`${bankFetchState.workspaceId} = ${workspaceId} and ${bankFetchState.nextAllowedAt} <= clock_timestamp()`,
      )
      .returning()
    if (!claimed.length) return { deferred: true as const, reason: 'cooldown' as const }

    try {
      const result = await bankFetchContext.run(
        {
          beforeRequest: async () => {
            // This uses the connection holding the advisory lock. A lost lock
            // connection must stop subsequent network calls, rather than reconnect.
            await lock.execute(sql`select 1`)
            const [state] = await db
              .update(bankFetchState)
              .set({ leaseUntil: sql`clock_timestamp() + interval '2 minutes'` })
              .where(eq(bankFetchState.workspaceId, workspaceId))
              .returning()
            if (state.failure?.kind === 'rate_limited')
              throw new EnableBankingRequestError(
                'Bank background reads are rate limited',
                true,
                state.failure,
              )
          },
          onRateLimit: (failure) => recordBankFetchFailure(db, workspaceId, failure),
        },
        operation,
      )
      return { deferred: false as const, result }
    } finally {
      await db
        .update(bankFetchState)
        .set({ lastFinishedAt: sql`clock_timestamp()`, leaseUntil: null })
        .where(eq(bankFetchState.workspaceId, workspaceId))
    }
  })
}
