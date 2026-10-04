import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createDb, personalMcpAudit } from '#db'
import {
  PersonalFinanceService,
  personalAccountsSchema,
  personalSpendingSummaryInputSchema,
  personalSpendingSummarySchema,
  personalTransactionPageSchema,
  searchPersonalTransactionsInputSchema,
} from '#finance'
import {
  getBankConsentStatus,
  recoverBankSelection,
  startBankConsent,
} from '../banking/consent-service'
import { AllBankReadService } from '../finance/all-bank-service'
import {
  allBankAccountsSchema,
  allBankReadInputSchema,
  allBankTotalsSchema,
  allBankTransactionPageSchema,
  bankAccountsSchema,
  bankReadInputSchema,
  bankTotalsSchema,
  bankTransactionPageSchema,
  listAllBankTransactionsInputSchema,
  listBankTransactionsInputSchema,
} from '../finance/bank-schemas'
import { BankReadService } from '../finance/bank-service'

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

const mutationAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

export type FinanceMcpContext =
  | { mode: 'business' }
  | { mode: 'all-banks' }
  | { mode: 'personal'; workspaceId: string; tokenId: string }
  | { mode: 'consent' }

export function createFinanceMcpServer(context: FinanceMcpContext = { mode: 'business' }) {
  if (context.mode === 'consent') {
    return createBankConsentMcpServer()
  }

  if (context.mode === 'personal') {
    return createPersonalFinanceMcpServer(context)
  }

  if (context.mode === 'all-banks') {
    const server = new McpServer({ name: 'bank-data-all-banks', version: '0.1.0' })
    registerAllBankReadTools(server)
    return server
  }

  const server = new McpServer({
    name: 'bank-data-finance',
    version: '0.2.0',
  })
  registerBankReadTools(server, context)

  return server
}

function createBankConsentMcpServer() {
  const server = new McpServer({ name: 'bank-data-bank-consent', version: '0.1.0' })

  server.registerTool(
    'start_bank_consent',
    {
      title: 'Start bank consent',
      description:
        'Start or renew read-only bank access. Open the returned authorization URL in your browser. Account selection happens after the bank redirects back.',
      inputSchema: {
        workspaceKind: z.enum(['personal', 'business']),
        aspspName: z.string().trim().min(1).max(150),
        aspspCountry: z.string().length(2).default('SE'),
        authMethod: z.string().trim().max(150).optional(),
        renew: z.boolean().default(false),
      },
      outputSchema: z.object({ url: z.string().url() }),
      annotations: { ...mutationAnnotations, openWorldHint: true },
    },
    async (input) => {
      try {
        const result = await startBankConsent(input)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        }
      } catch {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Bank consent could not be started. Check the bank and consent configuration.',
            },
          ],
          isError: true,
        }
      }
    },
  )

  server.registerTool(
    'get_bank_consent_status',
    {
      title: 'Get bank consent status',
      description:
        'Show aggregate connection health by workspace. No bank or account identifiers are returned.',
      annotations: readOnlyAnnotations,
    },
    async () => {
      try {
        const result = await getBankConsentStatus()
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        }
      } catch {
        return {
          content: [{ type: 'text' as const, text: 'Bank consent status is unavailable.' }],
          isError: true,
        }
      }
    },
  )

  server.registerTool(
    'recover_bank_selection',
    {
      title: 'Recover bank account selection',
      description:
        'Get a short-lived selection link for the latest completed personal bank renewal when its browser cookie was lost. Open the URL in one browser and finish account selection.',
      inputSchema: {
        aspspName: z.string().trim().min(1).max(150),
        aspspCountry: z.string().length(2).default('SE'),
      },
      outputSchema: z.object({ url: z.string().url() }),
      annotations: { ...mutationAnnotations, openWorldHint: true },
    },
    async (input) => {
      try {
        const result = await recoverBankSelection(input)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        }
      } catch {
        return {
          content: [{ type: 'text' as const, text: 'Bank selection recovery is unavailable.' }],
          isError: true,
        }
      }
    },
  )

  return server
}

function createPersonalFinanceMcpServer(context: Extract<FinanceMcpContext, { mode: 'personal' }>) {
  const server = new McpServer({
    name: 'bank-data-personal-finance',
    version: '0.3.0',
  })
  const finance = new PersonalFinanceService({ workspaceId: context.workspaceId })
  registerBankReadTools(server, context)

  server.registerTool(
    'list_personal_accounts',
    {
      title: 'List personal accounts',
      description:
        'List the personal bank accounts selected for tracking and their latest balances. IBANs and provider payloads are never returned.',
      outputSchema: personalAccountsSchema,
      annotations: readOnlyAnnotations,
    },
    async () =>
      executeOperation(async () => {
        const result = await finance.listAccounts()
        await recordPersonalAudit(context, 'list_personal_accounts', {}, result.accounts.length)
        return result
      }),
  )

  server.registerTool(
    'search_personal_transactions',
    {
      title: 'Search personal transactions',
      description:
        'Read personal transactions using exact dates, amounts, direction, account, currency, or indexed text tokens. Results are newest first and cursor-paginated. Set includeInternalTransfers false for spending analysis.',
      inputSchema: searchPersonalTransactionsInputSchema,
      outputSchema: personalTransactionPageSchema,
      annotations: readOnlyAnnotations,
    },
    async (input) =>
      executeOperation(async () => {
        const result = await finance.searchTransactions(input)
        await recordPersonalAudit(
          context,
          'search_personal_transactions',
          summarizePersonalFilters(input),
          result.transactions.length,
        )
        return result
      }),
  )

  server.registerTool(
    'summarize_personal_spending',
    {
      title: 'Summarize personal spending',
      description:
        'Calculate deterministic gross spending, refunds, and net spending grouped by original currency. Confirmed internal transfers are excluded by default. Indexed text tokens can scope the summary.',
      inputSchema: personalSpendingSummaryInputSchema,
      outputSchema: personalSpendingSummarySchema,
      annotations: readOnlyAnnotations,
    },
    async (input) =>
      executeOperation(async () => {
        const result = await finance.getSpendingSummary(input)
        await recordPersonalAudit(
          context,
          'summarize_personal_spending',
          summarizePersonalFilters(input),
          result.totals.reduce((count, total) => count + total.transactionCount, 0),
        )
        return result
      }),
  )

  return server
}

function registerAllBankReadTools(server: McpServer) {
  const bank = new AllBankReadService()
  const audit = (toolName: string, input: Record<string, unknown>, resultCount: number) => {
    console.info(
      JSON.stringify({
        event: 'bank_mcp_read',
        scope: 'all',
        toolName,
        filters: {
          hasBankFilter: typeof input.bankName === 'string',
          workspaceKind: input.workspaceKind,
          hasAccountFilter: typeof input.accountId === 'string',
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          limit: input.limit,
          hasCursor: typeof input.cursor === 'string',
        },
        resultCount,
      }),
    )
  }

  server.registerTool(
    'list_all_bank_accounts',
    {
      title: 'List all selected bank accounts',
      description:
        'Discover selected personal and business accounts before choosing a bank or account. Each account includes bankName, workspaceKind, and a stable id. A bank can have multiple accounts, such as personal and joint Revolut accounts; use each id to distinguish them. Connection status and last sync time indicate freshness.',
      outputSchema: allBankAccountsSchema,
      annotations: readOnlyAnnotations,
    },
    async () =>
      executeOperation(async () => {
        const result = await bank.listAccounts()
        audit('list_all_bank_accounts', {}, result.accounts.length)
        return result
      }),
  )

  server.registerTool(
    'list_all_bank_transactions',
    {
      title: 'List all booked bank transactions',
      description:
        'Read booked transactions from selected accounts. Filter by bankName, workspaceKind (personal or business), accountId, or inclusive UTC dates. A bankName filter includes every selected account at that bank; use accountId for one account, or group the answer by accountId and accountName. With no bank or workspace filter, every bank is interleaved newest first; keep banks and workspaces separate in the answer. If the requested bank or account is ambiguous, list accounts first and ask which one the user means. Follow nextCursor while incompletePage is true. Stored history may be incomplete.',
      inputSchema: listAllBankTransactionsInputSchema,
      outputSchema: allBankTransactionPageSchema,
      annotations: readOnlyAnnotations,
    },
    async (input) =>
      executeOperation(async () => {
        const result = await bank.listTransactions(input)
        audit('list_all_bank_transactions', input, result.transactions.length)
        return result
      }),
  )

  server.registerTool(
    'summarize_all_bank_transactions',
    {
      title: 'Summarize all booked bank transactions',
      description:
        'Return exact booked counts and credit, debit, and net totals grouped by bankName, workspaceKind, and original currency. Filter by bankName, workspaceKind (personal or business), accountId, or inclusive UTC dates. A bankName filter includes all its selected accounts; use accountId to total one personal or joint account. Use this to compare banks without mixing personal and business totals.',
      inputSchema: allBankReadInputSchema,
      outputSchema: allBankTotalsSchema,
      annotations: readOnlyAnnotations,
    },
    async (input) =>
      executeOperation(async () => {
        const result = await bank.getTotals(input)
        audit(
          'summarize_all_bank_transactions',
          input,
          result.totals.reduce((sum, row) => sum + row.transactionCount, 0),
        )
        return result
      }),
  )
}

function registerBankReadTools(
  server: McpServer,
  context: Extract<FinanceMcpContext, { mode: 'business' | 'personal' }>,
) {
  const bank = new BankReadService(
    context.mode,
    context.mode === 'personal' ? context.workspaceId : undefined,
  )
  const audit = async (toolName: string, input: Record<string, unknown>, resultCount: number) => {
    const summary = {
      hasAccountFilter: typeof input.accountId === 'string',
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      limit: input.limit,
      hasCursor: typeof input.cursor === 'string',
    }
    if (context.mode === 'personal') {
      await recordPersonalAudit(context, toolName, summary, resultCount)
    } else {
      console.info(
        JSON.stringify({ event: 'bank_mcp_read', toolName, filters: summary, resultCount }),
      )
    }
  }

  server.registerTool(
    'list_bank_accounts',
    {
      title: 'List selected bank accounts',
      description:
        'List selected accounts and latest known balances in this authorized workspace. Renewed personal connections are shown as one account. Connection status and last sync time indicate data freshness; stored history may be incomplete.',
      outputSchema: bankAccountsSchema,
      annotations: readOnlyAnnotations,
    },
    async () =>
      executeOperation(async () => {
        const result = await bank.listAccounts()
        await audit('list_bank_accounts', {}, result.accounts.length)
        return result
      }),
  )

  server.registerTool(
    'list_bank_transactions',
    {
      title: 'List booked bank transactions',
      description:
        'Read selected accounts in this authorized workspace by account and inclusive UTC dates. Results are newest first, booked only, with at most 200 rows. Continue with nextCursor while incompletePage is true. Account freshness is reported separately; full bank history is not guaranteed.',
      inputSchema: listBankTransactionsInputSchema,
      outputSchema: bankTransactionPageSchema,
      annotations: readOnlyAnnotations,
    },
    async (input) =>
      executeOperation(async () => {
        const result = await bank.listTransactions(input)
        await audit('list_bank_transactions', input, result.transactions.length)
        return result
      }),
  )

  server.registerTool(
    'summarize_bank_transactions',
    {
      title: 'Summarize booked bank transactions',
      description:
        'Return exact booked transaction counts and credit, debit, and net totals by original currency for selected accounts and inclusive UTC dates. Debits are negative. Freshness and connection status are reported separately.',
      inputSchema: bankReadInputSchema,
      outputSchema: bankTotalsSchema,
      annotations: readOnlyAnnotations,
    },
    async (input) =>
      executeOperation(async () => {
        const result = await bank.getTotals(input)
        await audit(
          'summarize_bank_transactions',
          input,
          result.totals.reduce((sum, row) => sum + row.transactionCount, 0),
        )
        return result
      }),
  )
}

async function recordPersonalAudit(
  context: Extract<FinanceMcpContext, { mode: 'personal' }>,
  toolName: string,
  filterSummary: Record<string, unknown>,
  resultCount: number,
) {
  await createDb().insert(personalMcpAudit).values({
    workspaceId: context.workspaceId,
    tokenId: context.tokenId,
    toolName,
    filterSummary,
    resultCount,
  })
}

function summarizePersonalFilters(input: Record<string, unknown>) {
  return {
    hasQuery: typeof input.query === 'string' && input.query.length > 0,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    hasAccountFilter: typeof input.accountId === 'string',
    currency: input.currency,
    direction: input.direction,
    includeInternalTransfers: input.includeInternalTransfers,
    limit: input.limit,
    hasCursor: typeof input.cursor === 'string',
  }
}

async function executeOperation<T extends Record<string, unknown>>(operation: () => Promise<T>) {
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
    console.error('MCP operation failed', error instanceof Error ? error.name : 'Unknown error')

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

function safeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Bank data request failed'
  }

  const safeMessages = [
    'Invalid pagination cursor',
    'No business workspace exists',
    'At least one selected account is required',
    'Account access changed during the request',
  ]

  if (safeMessages.includes(error.message)) {
    return error.message
  }

  return 'Bank data request failed'
}
