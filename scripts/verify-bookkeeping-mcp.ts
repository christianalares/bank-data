import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

// Secrets are read directly from private operator files, never printed.
const [endpoint, varsFile, writeTokenFile, importFile] = process.argv.slice(2)
const variables = JSON.parse(await readFile(varsFile, 'utf8')) as Record<string, string>
const writeToken = (await readFile(writeTokenFile, 'utf8')).trim()
const source = JSON.parse(await readFile(importFile, 'utf8')) as {
  transactions: Record<string, string>[]
  documents: Record<string, string>[]
  invoices: Record<string, unknown>[]
}
async function connect(token: string) {
  const client = new Client({ name: 'bookkeeping-acceptance', version: '1.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  )
  return client
}
async function call(client: Client, name: string, args: Record<string, unknown>) {
  const r = await client.callTool({ name, arguments: args })
  assert.ok(!r.isError, `Tool failed: ${name}`)
  return r.structuredContent as {
    records: Record<string, unknown>[]
    nextCursor: string | null
    replayed?: boolean
  }
}
async function pages(client: Client, name: string) {
  const rows: Record<string, unknown>[] = []
  let cursor: string | undefined
  do {
    const r = await call(client, name, { limit: 37, ...(cursor ? { cursor } : {}) })
    rows.push(...r.records)
    cursor = r.nextCursor ?? undefined
  } while (cursor)
  return rows
}
const reader = await connect(variables.MCP_ALL_BANKS_TOKEN)
const writer = await connect(writeToken)
try {
  const reads = (await reader.listTools()).tools
  assert.equal(reads.length, 7)
  assert.ok(reads.every((t) => t.annotations?.readOnlyHint === true))
  const writes = (await writer.listTools()).tools
  assert.equal(writes.length, 7)
  assert.equal(writes.filter((t) => t.annotations?.readOnlyHint === false).length, 3)
  const txs = await pages(reader, 'list_bookkeeping_transactions')
  const docs = await pages(reader, 'list_bookkeeping_documents')
  const invoices = await pages(reader, 'list_bookkeeping_invoices')
  const history = await pages(reader, 'list_bookkeeping_history')
  assert.equal(txs.length, source.transactions.length)
  assert.equal(docs.length, source.documents.length)
  assert.equal(invoices.length, source.invoices.length)
  assert.equal(history.length, txs.length + docs.length + invoices.length)
  assert.equal(new Set(txs.map((r) => r.providerTransactionId)).size, txs.length)
  for (const t of source.transactions) {
    const r = txs.find((row) => row.providerTransactionId === t.provider_transaktion_id)
    assert.ok(r)
    assert.deepEqual(r.metadata, t)
    assert.equal(r.bankDate, t.datum)
  }
  for (const d of source.documents)
    assert.deepEqual(docs.find((r) => r.sha256 === d.fil_sha256)?.metadata, d)
  for (const invoice of source.invoices) {
    const r = invoices.find((row) => row.externalKey === invoice.externalKey)
    assert.ok(r)
    for (const [key, value] of Object.entries(invoice)) {
      if (!['requestId', 'actor', 'expectedRevision'].includes(key)) assert.deepEqual(r[key], value)
    }
  }
  const replay = await call(writer, 'record_bookkeeping_invoice', source.invoices[0])
  assert.equal(replay.replayed, true)
  const invalid = await writer.callTool({
    name: 'record_bookkeeping_invoice',
    arguments: { ...source.invoices[0], requestId: 'acceptance:stale-revision' },
  })
  assert.equal(invalid.isError, true)
  const historyAfter = await pages(reader, 'list_bookkeeping_history')
  assert.equal(historyAfter.length, history.length)
  console.log(
    JSON.stringify({
      verified: true,
      readTools: reads.length,
      writeTools: writes.length,
      transactions: txs.length,
      confirmed: txs.filter((r) => r.matchingState === 'confirmed').length,
      documents: docs.length,
      invoices: invoices.length,
      history: history.length,
      mutationReplay: true,
      staleRevisionRejected: true,
    }),
  )
} finally {
  await reader.close()
  await writer.close()
}
