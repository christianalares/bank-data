import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { and, eq, inArray } from 'drizzle-orm'
import { BookkeepingService } from '../src/bookkeeping/service'
import type { Database } from '../src/db/index'
import {
  bankTransaction,
  bookkeepingAudit,
  bookkeepingDocument,
  bookkeepingInvoice,
  bookkeepingTransaction,
  closeDb,
  createDb,
} from '../src/db/index'

const source = JSON.parse(await readFile(process.argv[2], 'utf8')) as {
  sourceRoot: string
  sourceHashes: Record<string, string>
  documents: Record<string, string>[]
  transactions: Record<string, string>[]
  aliases: Record<string, string>[]
  invoices: Parameters<BookkeepingService['putInvoice']>[0][]
}
const workspaceId = process.env.BANK_CONSENT_BUSINESS_WORKSPACE_ID
if (!workspaceId) throw new Error('Explicit business workspace required')
const status = {
  'ej-granskad': 'unreviewed',
  'att-granska': 'review',
  bekraftad: 'confirmed',
  'saknar-underlag': 'missing',
  'hanteras-av-sfl': 'accountant',
} as const
const sourceDigest = createHash('sha256').update(JSON.stringify(source.sourceHashes)).digest('hex')
const db = createDb()
try {
  const bankRows = await db
    .select()
    .from(bankTransaction)
    .where(
      and(
        eq(bankTransaction.workspaceId, workspaceId),
        inArray(
          bankTransaction.providerTransactionId,
          source.transactions.map((t) => t.provider_transaktion_id),
        ),
      ),
    )
  let replayed = 0
  await db.transaction(async (tx) => {
    const service = new BookkeepingService(tx as unknown as Database, workspaceId)
    for (const d of source.documents) {
      const result = await service.putDocument({
        requestId: `backfill-document:${d.fil_sha256}`,
        actor: 'verified_backfill',
        expectedRevision: 0,
        sha256: d.fil_sha256,
        localPath: d.lokal_fil,
        originalFilename: d.originalfil,
        sourceReference: d.kalla_id || `${d.kalla}:${d.lokal_fil}`,
        sentStatus: d.utskicksstatus as 'skickat' | 'ej-skickat' | 'ej-avsett',
        metadata: d,
      })
      if (result.replayed) replayed++
    }
    for (const t of source.transactions) {
      const candidates = bankRows.filter(
        (b) => b.providerTransactionId === t.provider_transaktion_id,
      )
      const bank = candidates.find((b) => b.id === t.bank_transaktion_id) ?? candidates[0]
      const documentHashes = source.documents
        .filter(
          (d) =>
            d.provider_transaktion_id === t.provider_transaktion_id &&
            ['bekraftad', 'bekraftad-lokalt'].includes(d.koppling),
        )
        .map((d) => d.fil_sha256)
      const result = await service.putTransaction({
        requestId: `backfill-transaction:${t.provider_transaktion_id}`,
        actor: 'verified_backfill',
        expectedRevision: 0,
        providerTransactionId: t.provider_transaktion_id,
        bankTransactionId: bank?.id ?? null,
        bankAliasIds: source.aliases
          .filter((a) => a.provider_transaktion_id === t.provider_transaktion_id)
          .map((a) => a.bank_transaktion_id),
        bankDate: t.datum,
        amount: t.belopp_sek,
        currency: 'SEK',
        description: t.banktext,
        matchingState: status[t.matchningsstatus as keyof typeof status],
        documentHashes,
        followupClosed: t.uppfoljningsstatus === 'behandlad',
        metadata: t,
        evidence: {
          sourceType: 'historical_register',
          reference: `${source.sourceRoot}/underlag/2026/transaktioner.csv#${t.provider_transaktion_id};source-digest:${sourceDigest}`,
          explanation:
            t.kommentar ||
            'Verified canonical transaction register; preserve recorded decision and linked document hashes',
        },
      })
      if (result.replayed) replayed++
    }
    for (const invoice of source.invoices) {
      const result = await service.putInvoice(invoice)
      if (result.replayed) replayed++
    }
  })
  const [transactions, documents, invoices, history] = await Promise.all([
    db
      .select()
      .from(bookkeepingTransaction)
      .where(eq(bookkeepingTransaction.workspaceId, workspaceId)),
    db.select().from(bookkeepingDocument).where(eq(bookkeepingDocument.workspaceId, workspaceId)),
    db.select().from(bookkeepingInvoice).where(eq(bookkeepingInvoice.workspaceId, workspaceId)),
    db.select().from(bookkeepingAudit).where(eq(bookkeepingAudit.workspaceId, workspaceId)),
  ])
  console.log(
    JSON.stringify({
      sourceDigest,
      transactions: transactions.length,
      confirmed: transactions.filter((t) => t.matchingState === 'confirmed').length,
      documents: documents.length,
      confirmedDocumentLinks: transactions.flatMap((t) => t.documentHashes).length,
      historicalWithoutBankRow: transactions.filter((t) => !t.bankTransactionId).length,
      invoices: invoices.length,
      history: history.length,
      replayed,
    }),
  )
} finally {
  await closeDb()
}
