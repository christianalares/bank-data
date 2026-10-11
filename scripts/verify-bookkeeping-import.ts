import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { eq, sql } from 'drizzle-orm'
import {
  bookkeepingDocument,
  bookkeepingInvoice,
  bookkeepingTransaction,
  closeDb,
  createDb,
} from '../src/db/index'

const source = JSON.parse(await readFile(process.argv[2], 'utf8')) as {
  transactions: Record<string, string>[]
  documents: Record<string, string>[]
  invoices: Record<string, unknown>[]
}
const scope = process.env.BANK_CONSENT_BUSINESS_WORKSPACE_ID
assert.ok(scope, 'Explicit business workspace required')
const db = createDb()
try {
  const docs = await db
    .select()
    .from(bookkeepingDocument)
    .where(eq(bookkeepingDocument.workspaceId, scope))
  const txs = await db
    .select()
    .from(bookkeepingTransaction)
    .where(eq(bookkeepingTransaction.workspaceId, scope))
  const invoices = await db
    .select()
    .from(bookkeepingInvoice)
    .where(eq(bookkeepingInvoice.workspaceId, scope))
  assert.equal(docs.length, source.documents.length)
  assert.equal(txs.length, source.transactions.length)
  assert.equal(invoices.length, source.invoices.length)
  for (const d of source.documents) {
    const stored = docs.find((r) => r.sha256 === d.fil_sha256)
    assert.ok(stored)
    assert.deepEqual(stored.metadata, d)
    assert.equal(stored.localPath, d.lokal_fil)
    assert.equal(stored.sentStatus, d.utskicksstatus)
  }
  for (const t of source.transactions) {
    const stored = txs.find((r) => r.providerTransactionId === t.provider_transaktion_id)
    assert.ok(stored)
    assert.deepEqual(stored.metadata, t)
    assert.equal(stored.bankDate, t.datum)
    assert.equal(stored.followupClosed, t.uppfoljningsstatus === 'behandlad')
    const hashes = source.documents
      .filter(
        (d) =>
          d.provider_transaktion_id === t.provider_transaktion_id &&
          ['bekraftad', 'bekraftad-lokalt'].includes(d.koppling),
      )
      .map((d) => d.fil_sha256)
      .sort()
    assert.deepEqual([...stored.documentHashes].sort(), hashes)
  }
  const bank = await db.execute(
    sql`select count(*)::int as count, md5(string_agg(id::text || ':' || internal_id::text, ',' order by id)) as id_digest from bank_transaction`,
  )
  const digest = createHash('sha256')
    .update(
      JSON.stringify(
        txs
          .map((t) => [
            t.providerTransactionId,
            t.bankDate,
            t.matchingState,
            [...t.documentHashes].sort(),
            t.followupClosed,
          ])
          .sort(),
      ),
    )
    .digest('hex')
  console.log(
    JSON.stringify({
      verified: true,
      transactions: txs.length,
      confirmed: txs.filter((t) => t.matchingState === 'confirmed').length,
      documents: docs.length,
      invoices: invoices.length,
      closed: txs.filter((t) => t.followupClosed).length,
      bank: bank[0],
      reviewDigest: digest,
    }),
  )
} finally {
  await closeDb()
}
