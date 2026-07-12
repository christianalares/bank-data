import {
  attachmentPageSchema,
  FinanceService,
  financeOverviewSchema,
  getTransactionInputSchema,
  listAttachmentsInputSchema,
  searchTransactionsInputSchema,
  transactionDetailSchema,
  transactionPageSchema,
} from '@bank-data/finance'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = new McpServer({
  name: 'bank-data-finance',
  version: '0.1.0',
})

const finance = new FinanceService({
  ownerEmail: getRequiredOwnerEmail(),
})

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

server.registerTool(
  'get_finance_overview',
  {
    title: 'Get finance overview',
    description:
      'Count transactions by attachment state and attachments by workflow state. Use this to quickly identify missing invoices and pending suggestions.',
    outputSchema: financeOverviewSchema,
    annotations: readOnlyAnnotations,
  },
  async () => executeRead(() => finance.getOverview()),
)

server.registerTool(
  'search_transactions',
  {
    title: 'Search transactions',
    description:
      'Search every transaction in the configured workspace using dates, amounts, text, account, currency, booking status, and attachment state. Results are newest first and cursor-paginated.',
    inputSchema: searchTransactionsInputSchema,
    outputSchema: transactionPageSchema,
    annotations: readOnlyAnnotations,
  },
  async (input) => executeRead(() => finance.searchTransactions(input)),
)

server.registerTool(
  'list_attachments',
  {
    title: 'List invoice attachments',
    description:
      'Find attachment metadata and parsed invoice fields by workflow state, source, text, or related transaction. Document bytes and signed storage URLs are intentionally excluded.',
    inputSchema: listAttachmentsInputSchema,
    outputSchema: attachmentPageSchema,
    annotations: readOnlyAnnotations,
  },
  async (input) => executeRead(() => finance.listAttachments(input)),
)

server.registerTool(
  'get_transaction',
  {
    title: 'Get transaction details',
    description:
      'Get one workspace transaction with its matched and suggested invoice attachments. Document bytes and signed storage URLs are intentionally excluded.',
    inputSchema: getTransactionInputSchema,
    outputSchema: transactionDetailSchema,
    annotations: readOnlyAnnotations,
  },
  async ({ transactionId }) => executeRead(() => finance.getTransaction(transactionId)),
)

async function executeRead<T extends Record<string, unknown>>(operation: () => Promise<T>) {
  try {
    const result = await operation()

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result),
        },
      ],
      structuredContent: result,
    }
  } catch (error) {
    console.error(error)

    return {
      content: [
        {
          type: 'text' as const,
          text: safeErrorMessage(error),
        },
      ],
      isError: true,
    }
  }
}

function getRequiredOwnerEmail() {
  const ownerEmail = process.env.MCP_OWNER_EMAIL?.trim()

  if (!ownerEmail) {
    throw new Error('MCP_OWNER_EMAIL is required')
  }

  return ownerEmail
}

function safeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Finance request failed'
  }

  const safeMessages = [
    'Invalid pagination cursor',
    'MCP owner is not authorized',
    'No workspace exists for the configured MCP owner',
    'Transaction not found',
  ]

  if (safeMessages.includes(error.message)) {
    return error.message
  }

  return 'Finance request failed'
}

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
