import { createHash } from 'node:crypto'
import { and, asc, eq, gt, gte, inArray, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  bankTransaction,
  bookkeepingAudit,
  bookkeepingDocument,
  bookkeepingInvoice,
  bookkeepingTransaction,
  createDb,
  type Database,
  workspace,
} from '#db'
import {
  documentInput,
  documentListInput,
  historyListInput,
  invoiceInput,
  invoiceListInput,
  transactionInput,
  transactionListInput,
} from './schemas'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
type RecordValue = Record<string, unknown>
type WriteMeta = { requestId: string; actor: string; expectedRevision: number }

export class BookkeepingService {
  constructor(
    private readonly db: Database = createDb(),
    private readonly workspaceId = process.env.BANK_CONSENT_BUSINESS_WORKSPACE_ID,
  ) {}

  async listDocuments(input: z.input<typeof documentListInput>) {
    const f = documentListInput.parse(input)
    const scope = await this.scope()
    const conditions = [eq(bookkeepingDocument.workspaceId, scope)]
    if (f.key) conditions.push(eq(bookkeepingDocument.sha256, f.key))
    if (f.cursor) conditions.push(gt(bookkeepingDocument.sha256, f.cursor))
    const rows = await this.db
      .select()
      .from(bookkeepingDocument)
      .where(and(...conditions))
      .orderBy(asc(bookkeepingDocument.sha256))
      .limit(f.limit + 1)
    return this.page(rows, f.limit, (r) => r.sha256)
  }

  async listTransactions(input: z.input<typeof transactionListInput>) {
    const f = transactionListInput.parse(input)
    const scope = await this.scope()
    const conditions = [eq(bookkeepingTransaction.workspaceId, scope)]
    if (f.key) conditions.push(eq(bookkeepingTransaction.providerTransactionId, f.key))
    if (f.cursor) conditions.push(gt(bookkeepingTransaction.providerTransactionId, f.cursor))
    if (f.dateFrom) conditions.push(gte(bookkeepingTransaction.bankDate, f.dateFrom))
    if (f.dateTo) conditions.push(lte(bookkeepingTransaction.bankDate, f.dateTo))
    if (f.matchingState) conditions.push(eq(bookkeepingTransaction.matchingState, f.matchingState))
    if (!f.includeClosed) conditions.push(eq(bookkeepingTransaction.followupClosed, false))
    const rows = await this.db
      .select()
      .from(bookkeepingTransaction)
      .where(and(...conditions))
      .orderBy(asc(bookkeepingTransaction.providerTransactionId))
      .limit(f.limit + 1)
    return this.page(rows, f.limit, (r) => r.providerTransactionId)
  }

  async listInvoices(input: z.input<typeof invoiceListInput>) {
    const f = invoiceListInput.parse(input)
    const scope = await this.scope()
    const conditions = [eq(bookkeepingInvoice.workspaceId, scope)]
    if (f.key) conditions.push(eq(bookkeepingInvoice.externalKey, f.key))
    if (f.cursor) conditions.push(gt(bookkeepingInvoice.externalKey, f.cursor))
    if (f.paymentState) conditions.push(eq(bookkeepingInvoice.paymentState, f.paymentState))
    const rows = await this.db
      .select()
      .from(bookkeepingInvoice)
      .where(and(...conditions))
      .orderBy(asc(bookkeepingInvoice.externalKey))
      .limit(f.limit + 1)
    const keys = [...new Set(rows.flatMap((r) => r.transactionKeys))]
    const reviews = keys.length
      ? await this.db
          .select()
          .from(bookkeepingTransaction)
          .where(
            and(
              eq(bookkeepingTransaction.workspaceId, scope),
              inArray(bookkeepingTransaction.providerTransactionId, keys),
            ),
          )
      : []
    const states = new Map(reviews.map((r) => [r.providerTransactionId, r.matchingState]))
    // This is a view of explicitly recorded links, not a matching decision.
    return this.page(
      rows.map((r) => ({
        ...r,
        matchingState:
          r.transactionKeys.length > 0 &&
          r.transactionKeys.every((key) => states.get(key) === 'confirmed')
            ? 'confirmed'
            : 'unmatched',
      })),
      f.limit,
      (r) => r.externalKey,
    )
  }

  async listHistory(input: z.input<typeof historyListInput>) {
    const f = historyListInput.parse(input)
    const scope = await this.scope()
    const conditions = [eq(bookkeepingAudit.workspaceId, scope)]
    if (f.key) conditions.push(eq(bookkeepingAudit.entityKey, f.key))
    if (f.cursor) conditions.push(gt(bookkeepingAudit.requestId, f.cursor))
    const rows = await this.db
      .select()
      .from(bookkeepingAudit)
      .where(and(...conditions))
      .orderBy(asc(bookkeepingAudit.requestId))
      .limit(f.limit + 1)
    return this.page(rows, f.limit, (r) => r.requestId)
  }

  async putDocument(raw: z.input<typeof documentInput>) {
    const input = documentInput.parse(raw)
    const scope = await this.scope()
    const { requestId: _requestId, actor: _actor, expectedRevision: _revision, ...values } = input
    const condition = and(
      eq(bookkeepingDocument.workspaceId, scope),
      eq(bookkeepingDocument.sha256, input.sha256),
    )
    return this.write(
      input,
      scope,
      'document',
      input.sha256,
      async (tx) =>
        (await tx.select().from(bookkeepingDocument).where(condition).limit(1))[0] ?? null,
      async (tx, revision) => {
        const data = { ...values, workspaceId: scope, revision, updatedAt: new Date() }
        const rows =
          revision === 1
            ? await tx.insert(bookkeepingDocument).values(data).returning()
            : await tx.update(bookkeepingDocument).set(data).where(condition).returning()
        return rows[0]
      },
    )
  }

  async putTransaction(raw: z.input<typeof transactionInput>) {
    const input = transactionInput.parse(raw)
    const scope = await this.scope()
    const { requestId: _requestId, actor: _actor, expectedRevision: _revision, ...values } = input
    const condition = and(
      eq(bookkeepingTransaction.workspaceId, scope),
      eq(bookkeepingTransaction.providerTransactionId, input.providerTransactionId),
    )
    return this.write(
      input,
      scope,
      'transaction',
      input.providerTransactionId,
      async (tx) =>
        (await tx.select().from(bookkeepingTransaction).where(condition).limit(1))[0] ?? null,
      async (tx, revision) => {
        await this.requireDocuments(tx, scope, input.documentHashes)
        if (input.bankTransactionId) {
          const [bank] = await tx
            .select()
            .from(bankTransaction)
            .where(
              and(
                eq(bankTransaction.workspaceId, scope),
                eq(bankTransaction.id, input.bankTransactionId),
              ),
            )
            .limit(1)
          if (
            !bank ||
            bank.status !== 'booked' ||
            bank.providerTransactionId !== input.providerTransactionId ||
            bank.amount !== input.amount ||
            bank.currency !== input.currency ||
            bank.description !== input.description
          ) {
            throw new Error(
              'Exact booked business transaction does not agree with the supplied record',
            )
          }
          const metadata = bank.rawMetadata as { booking_date?: string } | null
          const bankDate = metadata?.booking_date ?? bank.bookedAt.toISOString().slice(0, 10)
          if (bankDate !== input.bankDate)
            throw new Error('Bank date does not agree with source booking_date')
        }
        if (input.matchingState === 'confirmed') {
          // An explicit correction is allowed with revision/evidence and an audit record;
          // a document cannot silently confirm a second distinct payment.
          const matches = await tx
            .select()
            .from(bookkeepingTransaction)
            .where(
              and(
                eq(bookkeepingTransaction.workspaceId, scope),
                eq(bookkeepingTransaction.matchingState, 'confirmed'),
              ),
            )
          if (
            matches.some(
              (m) =>
                m.providerTransactionId !== input.providerTransactionId &&
                m.documentHashes.some((h) => input.documentHashes.includes(h)),
            )
          )
            throw new Error('A document already confirms another payment')
        }
        const data = { ...values, workspaceId: scope, revision, updatedAt: new Date() }
        const rows =
          revision === 1
            ? await tx.insert(bookkeepingTransaction).values(data).returning()
            : await tx.update(bookkeepingTransaction).set(data).where(condition).returning()
        return rows[0]
      },
    )
  }

  async putInvoice(raw: z.input<typeof invoiceInput>) {
    const input = invoiceInput.parse(raw)
    const scope = await this.scope()
    const { requestId: _requestId, actor: _actor, expectedRevision: _revision, ...values } = input
    const condition = and(
      eq(bookkeepingInvoice.workspaceId, scope),
      eq(bookkeepingInvoice.externalKey, input.externalKey),
    )
    return this.write(
      input,
      scope,
      'invoice',
      input.externalKey,
      async (tx) =>
        (await tx.select().from(bookkeepingInvoice).where(condition).limit(1))[0] ?? null,
      async (tx, revision) => {
        await this.requireDocuments(tx, scope, input.documentHashes)
        if (input.transactionKeys.length) {
          const links = await tx
            .select()
            .from(bookkeepingTransaction)
            .where(
              and(
                eq(bookkeepingTransaction.workspaceId, scope),
                inArray(bookkeepingTransaction.providerTransactionId, input.transactionKeys),
              ),
            )
          if (links.length !== input.transactionKeys.length)
            throw new Error('Transaction links must exist in the business information register')
          if (
            links.some(
              (link) =>
                link.matchingState === 'confirmed' &&
                !link.documentHashes.some((hash) => input.documentHashes.includes(hash)),
            )
          )
            throw new Error('Confirmed invoice links must share a registered document hash')
          if (!['paid', 'partially_paid', 'refunded'].includes(input.paymentState))
            throw new Error('A bank link requires an explicitly recorded completed payment')
        }
        const data = { ...values, workspaceId: scope, revision, updatedAt: new Date() }
        const rows =
          revision === 1
            ? await tx.insert(bookkeepingInvoice).values(data).returning()
            : await tx.update(bookkeepingInvoice).set(data).where(condition).returning()
        return rows[0]
      },
    )
  }

  private async scope() {
    const id = z.string().uuid().parse(this.workspaceId)
    const [owner] = await this.db
      .select({ id: workspace.id })
      .from(workspace)
      .where(and(eq(workspace.id, id), eq(workspace.kind, 'business')))
      .limit(1)
    if (!owner) throw new Error('Configured business workspace is unavailable')
    return id
  }

  private async requireDocuments(tx: Tx, scope: string, hashes: string[]) {
    if (!hashes.length) return
    const rows = await tx
      .select({ sha256: bookkeepingDocument.sha256 })
      .from(bookkeepingDocument)
      .where(
        and(
          eq(bookkeepingDocument.workspaceId, scope),
          inArray(bookkeepingDocument.sha256, hashes),
        ),
      )
    if (rows.length !== hashes.length)
      throw new Error('Every document hash must be registered in this business workspace')
  }

  private async write(
    input: WriteMeta,
    scope: string,
    entity: string,
    entityKey: string,
    read: (tx: Tx) => Promise<(RecordValue & { revision: number }) | null>,
    persist: (tx: Tx, revision: number) => Promise<RecordValue>,
  ) {
    const requestHash = createHash('sha256').update(canonicalJson({ entity, input })).digest('hex')
    return this.db.transaction(async (tx) => {
      // Serialize bookkeeping writes per workspace; the bank importer is unaffected.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`bookkeeping:${scope}`}, 0))`,
      )
      const [prior] = await tx
        .select()
        .from(bookkeepingAudit)
        .where(
          and(
            eq(bookkeepingAudit.workspaceId, scope),
            eq(bookkeepingAudit.requestId, input.requestId),
          ),
        )
        .limit(1)
      if (prior) {
        if (prior.requestHash !== requestHash)
          throw new Error('Idempotency key was already used with a different request')
        return { record: prior.after, replayed: true }
      }
      const before = await read(tx)
      if ((before?.revision ?? 0) !== input.expectedRevision)
        throw new Error('Revision conflict: read the current record before changing it')
      const after = wire(await persist(tx, input.expectedRevision + 1))
      await tx.insert(bookkeepingAudit).values({
        workspaceId: scope,
        requestId: input.requestId,
        requestHash,
        entity,
        entityKey,
        actor: input.actor,
        before: before ? wire(before) : null,
        after,
      })
      return { record: after, replayed: false }
    })
  }

  private page<T extends RecordValue>(rows: T[], limit: number, key: (row: T) => string) {
    const records = rows.slice(0, limit)
    return {
      records: records.map(wire),
      nextCursor: rows.length > limit ? key(records[records.length - 1]) : null,
      asOf: new Date().toISOString(),
    }
  }
}

function wire(value: RecordValue): RecordValue {
  return JSON.parse(JSON.stringify(value))
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(',')}}`
  return JSON.stringify(value)
}
