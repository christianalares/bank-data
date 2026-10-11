import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  bankTransaction,
  bookkeepingAudit,
  bookkeepingTransaction,
  closeDb,
  createDb,
  type Database,
  workspace,
} from '#db'
import { invoiceInput } from './schemas'
import { BookkeepingService } from './service'

const enabled = Boolean(process.env.BOOKKEEPING_TEST_DATABASE_URL)
const businessId =
  process.env.BOOKKEEPING_TEST_BUSINESS_WORKSPACE_ID ?? '00000000-0000-4000-8000-000000000001'
const rollback = new Error('intentional test rollback')
let db: Database

beforeAll(() => {
  if (enabled) db = createDb(process.env.BOOKKEEPING_TEST_DATABASE_URL)
})
afterAll(async () => {
  if (enabled) await closeDb()
})

// Rehearsal on an isolated production restore; every test rolls its changes back.
async function isolated(run: (service: BookkeepingService, tx: Database) => Promise<void>) {
  await expect(
    db.transaction(async (tx) => {
      await run(
        new BookkeepingService(tx as unknown as Database, businessId),
        tx as unknown as Database,
      )
      throw rollback
    }),
  ).rejects.toBe(rollback)
}
const hash = 'a'.repeat(64)
const document = {
  requestId: 'test:document',
  actor: 'Codex' as const,
  expectedRevision: 0,
  sha256: hash,
  localPath: 'docs/test.pdf',
  originalFilename: 'test.pdf',
  sourceReference: 'synthetic:test',
  sentStatus: 'ej-skickat' as const,
  metadata: {},
}
const invoice = {
  requestId: 'test:invoice',
  actor: 'Christian' as const,
  expectedRevision: 0,
  externalKey: 'test:invoice',
  vendor: 'Synthetic',
  invoiceNumber: 'TEST-1',
  ocr: null,
  bankgiro: null,
  amount: '100.00',
  currency: 'SEK',
  dueDate: '2026-10-20',
  paymentState: 'scheduled' as const,
  paymentDate: '2026-10-20',
  paymentEvidence: {
    sourceType: 'user_confirmation' as const,
    reference: 'test:confirmation',
    explanation: 'User confirms signed exact invoice and date',
  },
  documentHashes: [hash],
  transactionKeys: [],
  gmailReferences: [],
}

describe('invoice contract', () => {
  it('requires explicit evidence and date for signed scheduling', () => {
    expect(invoiceInput.safeParse(invoice).success).toBe(true)
    expect(invoiceInput.safeParse({ ...invoice, paymentEvidence: null }).success).toBe(false)
    expect(invoiceInput.safeParse({ ...invoice, paymentDate: null }).success).toBe(false)
    expect(invoiceInput.safeParse({ ...invoice, transactionKeys: ['test:bank'] }).success).toBe(
      false,
    )
    expect(
      invoiceInput.safeParse({
        ...invoice,
        paymentState: 'unknown',
        paymentEvidence: null,
        paymentDate: null,
      }).success,
    ).toBe(true)
  })
})

describe.skipIf(!enabled)('bookkeeping database integrity', () => {
  it('preserves scheduling independently of bank matching and audits transitions', async () =>
    isolated(async (service, tx) => {
      await service.putDocument(document)
      const created = await service.putInvoice(invoice)
      expect(created.replayed).toBe(false)
      const listed = await service.listInvoices({ key: invoice.externalKey })
      expect(listed.records[0]).toMatchObject({
        paymentState: 'scheduled',
        matchingState: 'unmatched',
        revision: 1,
      })
      expect((await service.putInvoice(invoice)).replayed).toBe(true)
      await expect(service.putInvoice({ ...invoice, amount: '101.00' })).rejects.toThrow(
        'different request',
      )
      await expect(service.putInvoice({ ...invoice, requestId: 'test:stale' })).rejects.toThrow(
        'Revision conflict',
      )
      await service.putInvoice({
        ...invoice,
        requestId: 'test:paid',
        expectedRevision: 1,
        paymentState: 'paid',
      })
      const history = await tx
        .select()
        .from(bookkeepingAudit)
        .where(
          and(
            eq(bookkeepingAudit.workspaceId, businessId),
            eq(bookkeepingAudit.entityKey, invoice.externalKey),
          ),
        )
      expect(history).toHaveLength(2)
      expect(history.find((h) => h.requestId === 'test:paid')?.before).toMatchObject({
        paymentState: 'scheduled',
        revision: 1,
      })
      expect(history.find((h) => h.requestId === 'test:paid')?.after).toMatchObject({
        paymentState: 'paid',
        revision: 2,
      })
    }))

  it('rejects cross-workspace bank IDs, bad dates and duplicate payment evidence', async () =>
    isolated(async (service, tx) => {
      await service.putDocument(document)
      const input = {
        requestId: 'test:transaction',
        actor: 'Codex' as const,
        expectedRevision: 0,
        providerTransactionId: 'historisk-blip-export:test',
        bankTransactionId: null,
        bankAliasIds: [],
        bankDate: '2026-10-01',
        amount: '-100.00',
        currency: 'SEK',
        description: 'Synthetic',
        matchingState: 'confirmed' as const,
        documentHashes: [hash],
        followupClosed: false,
        evidence: {
          sourceType: 'historical_register' as const,
          reference: 'test:source',
          explanation: 'Synthetic historical export',
        },
        metadata: {},
      }
      await service.putTransaction(input)
      await expect(
        service.putTransaction({
          ...input,
          requestId: 'test:duplicate-document',
          providerTransactionId: 'historisk-blip-export:test-2',
        }),
      ).rejects.toThrow('another payment')
      await expect(
        service.putInvoice({ ...invoice, paymentState: 'paid', documentHashes: ['b'.repeat(64)] }),
      ).rejects.toThrow('Every document hash')
      // Unknown/private IDs cannot be accepted through the business lookup.
      await expect(
        service.putTransaction({
          ...input,
          requestId: 'test:foreign-id',
          expectedRevision: 1,
          bankTransactionId: randomUUID(),
        }),
      ).rejects.toThrow('Exact booked business')
      const [bank] = await tx
        .select()
        .from(bankTransaction)
        .where(
          and(eq(bankTransaction.workspaceId, businessId), eq(bankTransaction.status, 'booked')),
        )
        .limit(1)
      const [review] = await tx
        .select()
        .from(bookkeepingTransaction)
        .where(eq(bookkeepingTransaction.providerTransactionId, bank.providerTransactionId!))
        .limit(1)
      await expect(
        service.putTransaction({
          ...input,
          requestId: 'test:bad-date',
          expectedRevision: review?.revision ?? 0,
          providerTransactionId: bank.providerTransactionId!,
          bankTransactionId: bank.id,
          amount: bank.amount,
          currency: bank.currency,
          description: bank.description!,
          bankDate: '1999-01-01',
        }),
      ).rejects.toThrow('Bank date')
      const [personal] = await tx
        .select({ id: workspace.id })
        .from(workspace)
        .where(eq(workspace.kind, 'personal'))
        .limit(1)
      await expect(new BookkeepingService(tx, personal.id).listInvoices({})).rejects.toThrow(
        'business workspace',
      )
    }))

  it('traverses all imported transactions without duplicates and preserves closed records', async () =>
    isolated(async (service, tx) => {
      const ids: string[] = []
      let cursor: string | undefined
      do {
        const page = await service.listTransactions({ limit: 17, cursor })
        ids.push(...page.records.map((r) => String(r.providerTransactionId)))
        cursor = page.nextCursor ?? undefined
      } while (cursor)
      expect(ids).toHaveLength(204)
      expect(new Set(ids).size).toBe(204)
      const active = await service.listTransactions({
        dateFrom: '2026-10-01',
        includeClosed: false,
      })
      expect(
        active.records.every((r) => !r.followupClosed && String(r.bankDate) >= '2026-10-01'),
      ).toBe(true)
      const original = await tx.execute(sql`select count(*)::int as count from bank_transaction`)
      expect(original[0].count).toBe(2817)
    }))
})
