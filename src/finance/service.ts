import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  not,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import {
  attachment,
  attachmentSuggestionDismissal,
  bankAccount,
  bankTransaction,
  createDb,
  type Database,
} from '#db'

import { decodeCursor, encodeCursor } from './cursor'
import {
  type AttachmentSummary,
  type ListAttachmentsInput,
  listAttachmentsInputSchema,
  type SearchTransactionsInput,
  searchTransactionsInputSchema,
  type TransactionSummary,
} from './schemas'

type FinanceServiceOptions = {
  db?: Database
}

type TransactionRow = {
  id: string
  accountId: string
  accountName: string | null
  bookedAt: Date
  amount: string
  currency: string
  description: string
  merchantName: string | null
  counterpartyName: string | null
  status: 'booked' | 'pending'
  note: string | null
  attachmentCount: number
  suggestedAttachmentCount: number
}

type TransactionReference = Pick<
  TransactionSummary,
  'id' | 'bookedAt' | 'amount' | 'currency' | 'description' | 'merchantName'
>

type AttachmentStateRow = {
  id: string
  status: 'unmatched' | 'suggested' | 'matched' | 'ignored'
  transactionId: string | null
  suggestedTransactionId: string | null
}

export class FinanceService {
  private readonly db: Database

  constructor({ db = createDb() }: FinanceServiceOptions = {}) {
    this.db = db
  }

  async searchTransactions(input: SearchTransactionsInput) {
    const filters = searchTransactionsInputSchema.parse(input)
    const workspaceId = await this.getWorkspaceId()
    const conditions: Array<SQL | undefined> = [eq(bankTransaction.workspaceId, workspaceId)]

    if (filters.query) {
      const pattern = `%${escapeLikePattern(filters.query)}%`
      conditions.push(
        or(
          ilike(bankTransaction.description, pattern),
          ilike(bankTransaction.merchantName, pattern),
          ilike(bankTransaction.counterpartyName, pattern),
          ilike(bankTransaction.note, pattern),
          sql`${bankTransaction.amount}::text ilike ${pattern}`,
        ),
      )
    }

    if (filters.dateFrom) {
      conditions.push(gte(bankTransaction.bookedAt, startOfUtcDay(filters.dateFrom)))
    }

    if (filters.dateTo) {
      conditions.push(lt(bankTransaction.bookedAt, startOfNextUtcDay(filters.dateTo)))
    }

    if (filters.amountMin !== undefined) {
      conditions.push(gte(bankTransaction.amount, filters.amountMin.toString()))
    }

    if (filters.amountMax !== undefined) {
      conditions.push(lte(bankTransaction.amount, filters.amountMax.toString()))
    }

    if (filters.currency) {
      conditions.push(eq(bankTransaction.currency, filters.currency))
    }

    if (filters.accountId) {
      conditions.push(eq(bankTransaction.accountId, filters.accountId))
    }

    if (filters.transactionStatus) {
      conditions.push(eq(bankTransaction.status, filters.transactionStatus))
    }

    conditions.push(transactionAttachmentStateCondition(filters.attachmentState, workspaceId))

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
        id: bankTransaction.id,
        accountId: bankTransaction.accountId,
        accountName: bankAccount.name,
        bookedAt: bankTransaction.bookedAt,
        amount: bankTransaction.amount,
        currency: bankTransaction.currency,
        description: bankTransaction.description,
        merchantName: bankTransaction.merchantName,
        counterpartyName: bankTransaction.counterpartyName,
        status: bankTransaction.status,
        note: bankTransaction.note,
        attachmentCount: matchedAttachmentCount(workspaceId),
        suggestedAttachmentCount: suggestedAttachmentCount(workspaceId),
      })
      .from(bankTransaction)
      .leftJoin(bankAccount, eq(bankTransaction.accountId, bankAccount.id))
      .where(and(...conditions))
      .orderBy(desc(bankTransaction.bookedAt), desc(bankTransaction.id))
      .limit(filters.limit + 1)

    const hasMore = rows.length > filters.limit
    const pageRows = hasMore ? rows.slice(0, filters.limit) : rows
    const lastRow = pageRows.at(-1)

    return {
      transactions: pageRows.map(toTransactionSummary),
      nextCursor:
        hasMore && lastRow
          ? encodeCursor({
              timestamp: lastRow.bookedAt.toISOString(),
              id: lastRow.id,
            })
          : null,
    }
  }

  async listAttachments(input: ListAttachmentsInput) {
    const filters = listAttachmentsInputSchema.parse(input)
    const workspaceId = await this.getWorkspaceId()
    const conditions: Array<SQL | undefined> = [eq(attachment.workspaceId, workspaceId)]

    if (filters.query) {
      const pattern = `%${escapeLikePattern(filters.query)}%`
      conditions.push(
        or(
          ilike(attachment.filename, pattern),
          sql`${attachment.parsedInvoice}::text ilike ${pattern}`,
        ),
      )
    }

    if (filters.state !== 'any') {
      conditions.push(attachmentStateCondition(filters.state))
    }

    if (filters.source) {
      conditions.push(eq(attachment.source, filters.source))
    }

    if (filters.transactionId) {
      conditions.push(
        or(
          eq(attachment.transactionId, filters.transactionId),
          eq(attachment.suggestedTransactionId, filters.transactionId),
        ),
      )
    }

    if (filters.cursor) {
      const cursor = decodeCursor(filters.cursor)
      const cursorDate = new Date(cursor.timestamp)
      conditions.push(
        or(
          lt(attachment.createdAt, cursorDate),
          and(eq(attachment.createdAt, cursorDate), lt(attachment.id, cursor.id)),
        ),
      )
    }

    const rows = await this.db
      .select({
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        status: attachment.status,
        source: attachment.source,
        parsedInvoice: attachment.parsedInvoice,
        transactionId: attachment.transactionId,
        suggestedTransactionId: attachment.suggestedTransactionId,
        createdAt: attachment.createdAt,
      })
      .from(attachment)
      .where(and(...conditions))
      .orderBy(desc(attachment.createdAt), desc(attachment.id))
      .limit(filters.limit + 1)

    const hasMore = rows.length > filters.limit
    const pageRows = hasMore ? rows.slice(0, filters.limit) : rows
    const transactionIds = [
      ...new Set(
        pageRows
          .flatMap((row) => [row.transactionId, row.suggestedTransactionId])
          .filter((id): id is string => id !== null),
      ),
    ]
    const transactionMap = await this.getTransactionReferences(workspaceId, transactionIds)
    const attachments = pageRows.map((row) =>
      toAttachmentSummary(
        row,
        row.transactionId ? (transactionMap.get(row.transactionId) ?? null) : null,
        row.suggestedTransactionId
          ? (transactionMap.get(row.suggestedTransactionId) ?? null)
          : null,
      ),
    )
    const lastRow = pageRows.at(-1)

    return {
      attachments,
      nextCursor:
        hasMore && lastRow
          ? encodeCursor({
              timestamp: lastRow.createdAt.toISOString(),
              id: lastRow.id,
            })
          : null,
    }
  }

  async getTransaction(transactionId: string) {
    const workspaceId = await this.getWorkspaceId()
    const [row] = await this.db
      .select({
        id: bankTransaction.id,
        accountId: bankTransaction.accountId,
        accountName: bankAccount.name,
        bookedAt: bankTransaction.bookedAt,
        amount: bankTransaction.amount,
        currency: bankTransaction.currency,
        description: bankTransaction.description,
        merchantName: bankTransaction.merchantName,
        counterpartyName: bankTransaction.counterpartyName,
        status: bankTransaction.status,
        note: bankTransaction.note,
        attachmentCount: matchedAttachmentCount(workspaceId),
        suggestedAttachmentCount: suggestedAttachmentCount(workspaceId),
      })
      .from(bankTransaction)
      .leftJoin(bankAccount, eq(bankTransaction.accountId, bankAccount.id))
      .where(
        and(eq(bankTransaction.workspaceId, workspaceId), eq(bankTransaction.id, transactionId)),
      )
      .limit(1)

    if (!row) {
      throw new Error('Transaction not found')
    }

    const attachmentPage = await this.listAttachments({
      transactionId,
      state: 'any',
      limit: 100,
    })

    return {
      ...toTransactionSummary(row),
      attachments: attachmentPage.attachments,
      attachmentsNextCursor: attachmentPage.nextCursor,
    }
  }

  async getAttachmentDownloadInfo(attachmentId: string) {
    const workspaceId = await this.getWorkspaceId()
    const row = await this.getWorkspaceAttachment(workspaceId, attachmentId)

    return {
      id: row.id,
      filename: row.filename,
      contentType: row.contentType,
      storageKey: row.s3Key,
    }
  }

  async linkAttachment(attachmentId: string, transactionId: string) {
    const workspaceId = await this.getWorkspaceId()
    const [row] = await Promise.all([
      this.getWorkspaceAttachment(workspaceId, attachmentId),
      this.requireWorkspaceTransaction(workspaceId, transactionId),
    ])
    const [updated] = await this.db
      .update(attachment)
      .set({
        transactionId,
        suggestedTransactionId: null,
        status: 'matched',
      })
      .where(and(eq(attachment.id, attachmentId), eq(attachment.workspaceId, workspaceId)))
      .returning({
        id: attachment.id,
        status: attachment.status,
        transactionId: attachment.transactionId,
        suggestedTransactionId: attachment.suggestedTransactionId,
      })

    if (!updated) {
      throw new Error('Attachment changed before it could be linked')
    }

    return toAttachmentMutationResult(row, updated)
  }

  async approveSuggestedMatch(attachmentId: string) {
    const workspaceId = await this.getWorkspaceId()
    const row = await this.getWorkspaceAttachment(workspaceId, attachmentId)

    if (row.status !== 'suggested' || row.transactionId || !row.suggestedTransactionId) {
      throw new Error('Attachment has no suggested match to approve')
    }

    await this.requireWorkspaceTransaction(workspaceId, row.suggestedTransactionId)

    const [updated] = await this.db
      .update(attachment)
      .set({
        transactionId: row.suggestedTransactionId,
        suggestedTransactionId: null,
        status: 'matched',
      })
      .where(
        and(
          eq(attachment.id, attachmentId),
          eq(attachment.workspaceId, workspaceId),
          eq(attachment.status, 'suggested'),
          isNull(attachment.transactionId),
          eq(attachment.suggestedTransactionId, row.suggestedTransactionId),
        ),
      )
      .returning({
        id: attachment.id,
        status: attachment.status,
        transactionId: attachment.transactionId,
        suggestedTransactionId: attachment.suggestedTransactionId,
      })

    if (!updated) {
      throw new Error('Attachment changed before the suggestion could be approved')
    }

    return toAttachmentMutationResult(row, updated)
  }

  async dismissSuggestedMatch(attachmentId: string) {
    const workspaceId = await this.getWorkspaceId()
    const row = await this.getWorkspaceAttachment(workspaceId, attachmentId)

    if (row.status !== 'suggested' || row.transactionId || !row.suggestedTransactionId) {
      throw new Error('Attachment has no suggested match to dismiss')
    }

    const suggestedTransactionId = row.suggestedTransactionId
    const updated = await this.db.transaction(async (tx) => {
      await tx
        .insert(attachmentSuggestionDismissal)
        .values({
          workspaceId,
          attachmentId,
          transactionId: suggestedTransactionId,
        })
        .onConflictDoNothing()

      const [result] = await tx
        .update(attachment)
        .set({
          suggestedTransactionId: null,
          status: 'unmatched',
        })
        .where(
          and(
            eq(attachment.id, attachmentId),
            eq(attachment.workspaceId, workspaceId),
            eq(attachment.status, 'suggested'),
            isNull(attachment.transactionId),
            eq(attachment.suggestedTransactionId, suggestedTransactionId),
          ),
        )
        .returning({
          id: attachment.id,
          status: attachment.status,
          transactionId: attachment.transactionId,
          suggestedTransactionId: attachment.suggestedTransactionId,
        })

      if (!result) {
        throw new Error('Attachment changed before the suggestion could be dismissed')
      }

      return result
    })

    return toAttachmentMutationResult(row, updated)
  }

  async unlinkAttachment(attachmentId: string) {
    const workspaceId = await this.getWorkspaceId()
    const row = await this.getWorkspaceAttachment(workspaceId, attachmentId)

    if (!row.transactionId) {
      throw new Error('Attachment is not linked to a transaction')
    }

    const [updated] = await this.db
      .update(attachment)
      .set({
        transactionId: null,
        suggestedTransactionId: null,
        status: 'unmatched',
      })
      .where(
        and(
          eq(attachment.id, attachmentId),
          eq(attachment.workspaceId, workspaceId),
          eq(attachment.transactionId, row.transactionId),
        ),
      )
      .returning({
        id: attachment.id,
        status: attachment.status,
        transactionId: attachment.transactionId,
        suggestedTransactionId: attachment.suggestedTransactionId,
      })

    if (!updated) {
      throw new Error('Attachment changed before it could be unlinked')
    }

    return toAttachmentMutationResult(row, updated)
  }

  async ignoreAttachment(attachmentId: string) {
    const workspaceId = await this.getWorkspaceId()
    const row = await this.getWorkspaceAttachment(workspaceId, attachmentId)

    if (row.transactionId) {
      throw new Error('Linked attachments must be unlinked before they can be ignored')
    }

    const [updated] = await this.db
      .update(attachment)
      .set({
        suggestedTransactionId: null,
        status: 'ignored',
      })
      .where(
        and(
          eq(attachment.id, attachmentId),
          eq(attachment.workspaceId, workspaceId),
          isNull(attachment.transactionId),
        ),
      )
      .returning({
        id: attachment.id,
        status: attachment.status,
        transactionId: attachment.transactionId,
        suggestedTransactionId: attachment.suggestedTransactionId,
      })

    if (!updated) {
      throw new Error('Attachment changed before it could be ignored')
    }

    return toAttachmentMutationResult(row, updated)
  }

  async getOverview() {
    const workspaceId = await this.getWorkspaceId()
    const [transactionTotal, transactionMissing, transactionSuggested, transactionMatched] =
      await Promise.all([
        this.countTransactions(workspaceId),
        this.countTransactions(
          workspaceId,
          transactionAttachmentStateCondition('missing', workspaceId),
        ),
        this.countTransactions(
          workspaceId,
          transactionAttachmentStateCondition('suggested', workspaceId),
        ),
        this.countTransactions(
          workspaceId,
          transactionAttachmentStateCondition('matched', workspaceId),
        ),
      ])
    const [attachmentTotal, attachmentUnmatched, attachmentSuggested, attachmentMatched, ignored] =
      await Promise.all([
        this.countAttachments(workspaceId),
        this.countAttachments(workspaceId, attachmentStateCondition('unmatched')),
        this.countAttachments(workspaceId, attachmentStateCondition('suggested')),
        this.countAttachments(workspaceId, attachmentStateCondition('matched')),
        this.countAttachments(workspaceId, attachmentStateCondition('ignored')),
      ])

    return {
      transactions: {
        total: transactionTotal,
        missing: transactionMissing,
        suggested: transactionSuggested,
        matched: transactionMatched,
      },
      attachments: {
        total: attachmentTotal,
        unmatched: attachmentUnmatched,
        suggested: attachmentSuggested,
        matched: attachmentMatched,
        ignored,
      },
    }
  }

  private async getWorkspaceId() {
    const ownerWorkspace = await this.db.query.workspace.findFirst({
      where: (table, { eq }) => eq(table.kind, 'business'),
      columns: {
        id: true,
      },
      orderBy: (table, { asc }) => [asc(table.createdAt)],
    })

    if (!ownerWorkspace) {
      throw new Error('No workspace exists')
    }

    return ownerWorkspace.id
  }

  private async getWorkspaceAttachment(workspaceId: string, attachmentId: string) {
    const row = await this.db.query.attachment.findFirst({
      where: (table, { and, eq }) =>
        and(eq(table.id, attachmentId), eq(table.workspaceId, workspaceId)),
    })

    if (!row) {
      throw new Error('Attachment not found')
    }

    return row
  }

  private async requireWorkspaceTransaction(workspaceId: string, transactionId: string) {
    const row = await this.db.query.bankTransaction.findFirst({
      where: (table, { and, eq }) =>
        and(eq(table.id, transactionId), eq(table.workspaceId, workspaceId)),
      columns: {
        id: true,
      },
    })

    if (!row) {
      throw new Error('Transaction not found')
    }

    return row
  }

  private async getTransactionReferences(workspaceId: string, transactionIds: string[]) {
    if (transactionIds.length === 0) {
      return new Map<string, TransactionReference>()
    }

    const rows = await this.db
      .select({
        id: bankTransaction.id,
        bookedAt: bankTransaction.bookedAt,
        amount: bankTransaction.amount,
        currency: bankTransaction.currency,
        description: bankTransaction.description,
        merchantName: bankTransaction.merchantName,
      })
      .from(bankTransaction)
      .where(
        and(
          eq(bankTransaction.workspaceId, workspaceId),
          inArray(bankTransaction.id, transactionIds),
        ),
      )

    return new Map(
      rows.map((row) => [
        row.id,
        {
          ...row,
          bookedAt: row.bookedAt.toISOString(),
        },
      ]),
    )
  }

  private async countTransactions(workspaceId: string, condition?: SQL) {
    const [result] = await this.db
      .select({ value: count() })
      .from(bankTransaction)
      .where(and(eq(bankTransaction.workspaceId, workspaceId), condition))

    return result?.value ?? 0
  }

  private async countAttachments(workspaceId: string, condition?: SQL) {
    const [result] = await this.db
      .select({ value: count() })
      .from(attachment)
      .where(and(eq(attachment.workspaceId, workspaceId), condition))

    return result?.value ?? 0
  }
}

function matchedAttachmentCount(workspaceId: string) {
  return sql<number>`(
    select count(*)::int
    from ${attachment}
    where ${attachment.transactionId} = ${bankTransaction.id}
      and ${attachment.workspaceId} = ${workspaceId}
  )`.mapWith(Number)
}

function suggestedAttachmentCount(workspaceId: string) {
  return sql<number>`(
    select count(*)::int
    from ${attachment}
    where ${attachment.suggestedTransactionId} = ${bankTransaction.id}
      and ${attachment.workspaceId} = ${workspaceId}
      and ${attachment.status} = 'suggested'
  )`.mapWith(Number)
}

function transactionAttachmentStateCondition(
  state: SearchTransactionsInput['attachmentState'],
  workspaceId: string,
): SQL | undefined {
  const hasMatchedAttachment = sql<boolean>`exists (
    select 1
    from ${attachment}
    where ${attachment.transactionId} = ${bankTransaction.id}
      and ${attachment.workspaceId} = ${workspaceId}
  )`
  const hasSuggestedAttachment = sql<boolean>`exists (
    select 1
    from ${attachment}
    where ${attachment.suggestedTransactionId} = ${bankTransaction.id}
      and ${attachment.workspaceId} = ${workspaceId}
      and ${attachment.status} = 'suggested'
  )`

  if (state === 'matched') {
    return hasMatchedAttachment
  }

  if (state === 'suggested') {
    return and(not(hasMatchedAttachment), hasSuggestedAttachment)
  }

  if (state === 'missing') {
    return and(not(hasMatchedAttachment), not(hasSuggestedAttachment))
  }

  return undefined
}

function attachmentStateCondition(
  state: Exclude<ListAttachmentsInput['state'], 'any'>,
): SQL | undefined {
  if (state === 'matched') {
    return isNotNull(attachment.transactionId)
  }

  if (state === 'suggested') {
    return and(
      isNull(attachment.transactionId),
      isNotNull(attachment.suggestedTransactionId),
      eq(attachment.status, 'suggested'),
    )
  }

  if (state === 'ignored') {
    return eq(attachment.status, 'ignored')
  }

  return and(isNull(attachment.transactionId), eq(attachment.status, 'unmatched'))
}

function toTransactionSummary(row: TransactionRow): TransactionSummary {
  const attachmentState =
    row.attachmentCount > 0 ? 'matched' : row.suggestedAttachmentCount > 0 ? 'suggested' : 'missing'

  return {
    id: row.id,
    accountId: row.accountId,
    accountName: row.accountName ?? 'Unknown account',
    bookedAt: row.bookedAt.toISOString(),
    amount: row.amount,
    currency: row.currency,
    description: row.description,
    merchantName: row.merchantName,
    counterpartyName: row.counterpartyName,
    status: row.status,
    note: row.note,
    attachmentCount: row.attachmentCount,
    suggestedAttachmentCount: row.suggestedAttachmentCount,
    attachmentState,
  }
}

function toAttachmentSummary(
  row: {
    id: string
    filename: string
    contentType: string
    sizeBytes: number
    status: 'unmatched' | 'suggested' | 'matched' | 'ignored'
    source: 'manual' | 'email'
    parsedInvoice: AttachmentSummary['parsedInvoice']
    transactionId: string | null
    suggestedTransactionId: string | null
    createdAt: Date
  },
  transaction: TransactionReference | null,
  suggestedTransaction: TransactionReference | null,
): AttachmentSummary {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    source: row.source,
    state: getAttachmentWorkflowState(row),
    createdAt: row.createdAt.toISOString(),
    parsedInvoice: row.parsedInvoice,
    transaction,
    suggestedTransaction,
  }
}

function toAttachmentMutationResult(previous: AttachmentStateRow, updated: AttachmentStateRow) {
  return {
    attachmentId: updated.id,
    previousState: getAttachmentWorkflowState(previous),
    state: getAttachmentWorkflowState(updated),
    transactionId: updated.transactionId,
    suggestedTransactionId: updated.suggestedTransactionId,
  }
}

function getAttachmentWorkflowState(row: AttachmentStateRow): AttachmentSummary['state'] {
  if (row.transactionId) {
    return 'matched'
  }

  if (row.status === 'ignored') {
    return 'ignored'
  }

  if (row.status === 'suggested' && row.suggestedTransactionId) {
    return 'suggested'
  }

  return 'unmatched'
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, '\\$&')
}

function startOfUtcDay(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

function startOfNextUtcDay(value: string) {
  const date = startOfUtcDay(value)
  date.setUTCDate(date.getUTCDate() + 1)
  return date
}
