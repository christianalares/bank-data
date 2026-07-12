import {
  attachment,
  bankAccount,
  bankTransaction,
  createDb,
  type Database,
} from '@bank-data/db'
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
  ownerEmail: string
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

export class FinanceService {
  private readonly db: Database
  private readonly ownerEmail: string
  private workspaceIdPromise: Promise<string> | undefined

  constructor({ ownerEmail, db = createDb() }: FinanceServiceOptions) {
    this.ownerEmail = ownerEmail.trim().toLowerCase()
    this.db = db

    if (!this.ownerEmail) {
      throw new Error('An owner email is required')
    }
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

    conditions.push(transactionAttachmentStateCondition(filters.attachmentState))

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
        attachmentCount: matchedAttachmentCount(),
        suggestedAttachmentCount: suggestedAttachmentCount(),
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
        attachmentCount: matchedAttachmentCount(),
        suggestedAttachmentCount: suggestedAttachmentCount(),
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
    }
  }

  async getOverview() {
    const workspaceId = await this.getWorkspaceId()
    const [transactionTotal, transactionMissing, transactionSuggested, transactionMatched] =
      await Promise.all([
        this.countTransactions(workspaceId),
        this.countTransactions(workspaceId, transactionAttachmentStateCondition('missing')),
        this.countTransactions(workspaceId, transactionAttachmentStateCondition('suggested')),
        this.countTransactions(workspaceId, transactionAttachmentStateCondition('matched')),
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
    if (!this.workspaceIdPromise) {
      this.workspaceIdPromise = this.resolveWorkspaceId()
    }

    return this.workspaceIdPromise
  }

  private async resolveWorkspaceId() {
    const owner = await this.db.query.user.findFirst({
      where: (table) => sql`lower(${table.email}) = ${this.ownerEmail}`,
      columns: {
        id: true,
        banned: true,
      },
    })

    if (!owner || owner.banned) {
      throw new Error('MCP owner is not authorized')
    }

    const ownerWorkspace = await this.db.query.workspace.findFirst({
      where: (table, { eq }) => eq(table.ownerId, owner.id),
      columns: {
        id: true,
      },
    })

    if (!ownerWorkspace) {
      throw new Error('No workspace exists for the configured MCP owner')
    }

    return ownerWorkspace.id
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

function matchedAttachmentCount() {
  return sql<number>`(
    select count(*)::int
    from ${attachment}
    where ${attachment.transactionId} = ${bankTransaction.id}
  )`.mapWith(Number)
}

function suggestedAttachmentCount() {
  return sql<number>`(
    select count(*)::int
    from ${attachment}
    where ${attachment.suggestedTransactionId} = ${bankTransaction.id}
      and ${attachment.status} = 'suggested'
  )`.mapWith(Number)
}

function transactionAttachmentStateCondition(
  state: SearchTransactionsInput['attachmentState'],
): SQL | undefined {
  const hasMatchedAttachment = sql<boolean>`exists (
    select 1
    from ${attachment}
    where ${attachment.transactionId} = ${bankTransaction.id}
  )`
  const hasSuggestedAttachment = sql<boolean>`exists (
    select 1
    from ${attachment}
    where ${attachment.suggestedTransactionId} = ${bankTransaction.id}
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
  let state: AttachmentSummary['state'] = 'unmatched'

  if (row.transactionId) {
    state = 'matched'
  } else if (row.status === 'ignored') {
    state = 'ignored'
  } else if (row.status === 'suggested' && row.suggestedTransactionId) {
    state = 'suggested'
  }

  return {
    id: row.id,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    source: row.source,
    state,
    createdAt: row.createdAt.toISOString(),
    parsedInvoice: row.parsedInvoice,
    transaction,
    suggestedTransaction,
  }
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
