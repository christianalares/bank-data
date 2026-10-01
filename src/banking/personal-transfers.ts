import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { bankTransaction, type Database } from '#db'

const MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000
const AUTO_CONFIRM_MINIMUM = 1_000

export async function matchPersonalTransfers({
  db,
  workspaceId,
  since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
}: {
  db: Database
  workspaceId: string
  since?: Date
}) {
  const transactions = await db.query.bankTransaction.findMany({
    where: (table, { and, eq, gte }) =>
      and(
        eq(table.workspaceId, workspaceId),
        eq(table.status, 'booked'),
        eq(table.transferState, 'ordinary'),
        gte(table.bookedAt, since),
      ),
    columns: {
      id: true,
      accountId: true,
      bookedAt: true,
      amount: true,
      currency: true,
    },
  })
  const debits = transactions.filter((transaction) => Number(transaction.amount) < 0)
  const credits = transactions.filter((transaction) => Number(transaction.amount) > 0)
  const usedIds = new Set<string>()
  let confirmed = 0
  let suggested = 0

  for (const debit of debits) {
    if (usedIds.has(debit.id)) {
      continue
    }

    const candidates = credits
      .filter(
        (credit) =>
          !usedIds.has(credit.id) &&
          credit.accountId !== debit.accountId &&
          credit.currency === debit.currency &&
          Math.abs(Number(credit.amount) + Number(debit.amount)) < 0.005 &&
          Math.abs(credit.bookedAt.getTime() - debit.bookedAt.getTime()) <= MATCH_WINDOW_MS,
      )
      .sort(
        (first, second) =>
          Math.abs(first.bookedAt.getTime() - debit.bookedAt.getTime()) -
          Math.abs(second.bookedAt.getTime() - debit.bookedAt.getTime()),
      )

    const credit = candidates[0]
    if (!credit) {
      continue
    }

    const reverseMatches = debits.filter(
      (candidate) =>
        !usedIds.has(candidate.id) &&
        candidate.accountId !== credit.accountId &&
        candidate.currency === credit.currency &&
        Math.abs(Number(candidate.amount) + Number(credit.amount)) < 0.005 &&
        Math.abs(candidate.bookedAt.getTime() - credit.bookedAt.getTime()) <= MATCH_WINDOW_MS,
    )
    const autoConfirm =
      candidates.length === 1 &&
      reverseMatches.length === 1 &&
      Math.abs(Number(debit.amount)) >= AUTO_CONFIRM_MINIMUM
    const transferPairId = randomUUID()
    const state = autoConfirm ? 'confirmed' : 'suggested'
    const confidence = autoConfirm ? '0.9800' : '0.7000'

    await db
      .update(bankTransaction)
      .set({
        transferState: state,
        transferPairId,
        transferConfidence: confidence,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bankTransaction.workspaceId, workspaceId),
          inArray(bankTransaction.id, [debit.id, credit.id]),
          eq(bankTransaction.transferState, 'ordinary'),
        ),
      )

    usedIds.add(debit.id)
    usedIds.add(credit.id)
    if (autoConfirm) {
      confirmed += 1
    } else {
      suggested += 1
    }
  }

  return { confirmed, suggested }
}
