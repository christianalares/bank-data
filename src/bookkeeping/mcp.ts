import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  documentInput,
  documentListInput,
  historyListInput,
  invoiceInput,
  invoiceListInput,
  transactionInput,
  transactionListInput,
} from './schemas'
import { BookkeepingService } from './service'

const record = z.record(z.string(), z.unknown())
const page = z.object({
  records: z.array(record),
  nextCursor: z.string().nullable(),
  asOf: z.string().datetime(),
})
const mutation = z.object({ record, replayed: z.boolean() })
const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}

export function registerBookkeepingTools(server: McpServer, writable = false) {
  server.registerTool(
    'list_bookkeeping_transactions',
    {
      description:
        'Read explicit company transaction review states, exact document hashes and evidence. Historical export IDs remain historical; followupClosed does not mean matched. Unregistered transactions have no review decision. Follow nextCursor. Never infer payment from a similar name or amount.',
      inputSchema: transactionListInput,
      outputSchema: page,
      annotations: readAnnotations,
    },
    async (input) => result(() => new BookkeepingService().listTransactions(input)),
  )
  server.registerTool(
    'list_bookkeeping_invoices',
    {
      description:
        'Read company invoices and recorded payment evidence. scheduled means signed but not yet executed; paid is separate from a confirmed bank/document link. key selects one invoice. Follow nextCursor.',
      inputSchema: invoiceListInput,
      outputSchema: page,
      annotations: readAnnotations,
    },
    async (input) => result(() => new BookkeepingService().listInvoices(input)),
  )
  server.registerTool(
    'list_bookkeeping_documents',
    {
      description:
        'Read local document metadata and exact source references; key selects a SHA-256. Local paths refer to the operator archive and are not remotely downloadable. No document interpretation is performed here. Follow nextCursor.',
      inputSchema: documentListInput,
      outputSchema: page,
      annotations: readAnnotations,
    },
    async (input) => result(() => new BookkeepingService().listDocuments(input)),
  )
  server.registerTool(
    'list_bookkeeping_history',
    {
      description:
        'Read immutable before/after status history and reported actor. key selects an invoice key, provider transaction ID or document hash. Follow nextCursor.',
      inputSchema: historyListInput,
      outputSchema: page,
      annotations: readAnnotations,
    },
    async (input) => result(() => new BookkeepingService().listHistory(input)),
  )
  if (!writable) return
  const annotations = { ...readAnnotations, readOnlyHint: false }
  server.registerTool(
    'record_bookkeeping_document',
    {
      description:
        'Register locally stored and hash-verified company document metadata. No upload or extraction. Supply a unique requestId and expectedRevision (0 for create); retries with identical arguments are idempotent.',
      inputSchema: documentInput,
      outputSchema: mutation,
      annotations,
    },
    async (input) => result(() => new BookkeepingService().putDocument(input)),
  )
  server.registerTool(
    'record_bookkeeping_invoice',
    {
      description:
        'Record an explicit company invoice/payment decision supplied by Christian or Codex with evidence. scheduled requires the signed payment date; it does not mark payment executed. This tool never initiates payment or sorts Gmail. Supply requestId and expectedRevision.',
      inputSchema: invoiceInput,
      outputSchema: mutation,
      annotations,
    },
    async (input) => result(() => new BookkeepingService().putInvoice(input)),
  )
  server.registerTool(
    'record_bookkeeping_transaction',
    {
      description:
        'Record an explicit company bank/document match or review decision with evidence. Confirmed requires registered document hashes and an exact business bank row, except preserved historical export IDs. Does not infer a match or alter bank history. Corrections require current expectedRevision and are audited; requestId makes retries idempotent.',
      inputSchema: transactionInput,
      outputSchema: mutation,
      annotations,
    },
    async (input) => result(() => new BookkeepingService().putTransaction(input)),
  )
}

async function result(operation: () => Promise<Record<string, unknown>>) {
  try {
    const data = await operation()
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      structuredContent: data,
    }
  } catch (error) {
    const message =
      error instanceof Error && !('query' in error)
        ? error.message
        : 'Bookkeeping operation failed; no change was committed'
    return { content: [{ type: 'text' as const, text: message }], isError: true }
  }
}
