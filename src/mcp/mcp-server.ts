import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createDb, personalMcpAudit } from '#db'
import {
  attachmentIdInputSchema,
  attachmentMutationResultSchema,
  attachmentPageSchema,
  FinanceService,
  financeOverviewSchema,
  getTransactionInputSchema,
  linkAttachmentInputSchema,
  listAttachmentsInputSchema,
  PersonalFinanceService,
  personalAccountsSchema,
  personalSpendingSummaryInputSchema,
  personalSpendingSummarySchema,
  personalTransactionPageSchema,
  searchPersonalTransactionsInputSchema,
  searchTransactionsInputSchema,
  transactionDetailSchema,
  transactionPageSchema,
} from '#finance'
import { createStorageClient } from '#storage'

import { renderAttachmentImage } from './attachment-image'

// Preview links are cached in storage and handed back as short-lived signed
// URLs so Markdown-only clients (e.g. Raycast) can render them inline.
const PREVIEW_EXPIRES_SECONDS = 60 * 60
const PREVIEW_EXPIRES_MINUTES = PREVIEW_EXPIRES_SECONDS / 60

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

const destructiveMutationAnnotations = {
  ...mutationAnnotations,
  destructiveHint: true,
} as const

const attachmentDownloadUrlSchema = z.object({
  attachmentId: z.string().uuid(),
  filename: z.string(),
  contentType: z.string(),
  url: z.string().url(),
  expiresAt: z.string().datetime(),
})

const attachmentImageInputSchema = z.object({
  attachmentId: z.string().uuid(),
  page: z.number().int().min(1).max(50).default(1),
})

export type FinanceMcpContext =
  | { mode: 'business' }
  | { mode: 'personal'; workspaceId: string; tokenId: string }

export function createFinanceMcpServer(context: FinanceMcpContext = { mode: 'business' }) {
  if (context.mode === 'personal') {
    return createPersonalFinanceMcpServer(context)
  }

  const server = new McpServer({
    name: 'hidden-village-finance',
    version: '0.2.0',
  })
  const finance = new FinanceService()

  server.registerTool(
    'get_finance_overview',
    {
      title: 'Get finance overview',
      description:
        'Count transactions by attachment state and attachments by workflow state. Use this to quickly identify missing invoices and pending suggestions.',
      outputSchema: financeOverviewSchema,
      annotations: readOnlyAnnotations,
    },
    async () => executeOperation(() => finance.getOverview()),
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
    async (input) => executeOperation(() => finance.searchTransactions(input)),
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
    async (input) => executeOperation(() => finance.listAttachments(input)),
  )

  server.registerTool(
    'get_transaction',
    {
      title: 'Get transaction details',
      description:
        'Get one workspace transaction with the first page of matched and suggested invoice attachments. Continue with list_attachments when attachmentsNextCursor is present. Document bytes and signed storage URLs are intentionally excluded.',
      inputSchema: getTransactionInputSchema,
      outputSchema: transactionDetailSchema,
      annotations: readOnlyAnnotations,
    },
    async ({ transactionId }) => executeOperation(() => finance.getTransaction(transactionId)),
  )

  server.registerTool(
    'get_attachment_download_url',
    {
      title: 'Get attachment download URL',
      description:
        'Create a short-lived signed URL for viewing or downloading one invoice attachment. The URL expires after five minutes.',
      inputSchema: attachmentIdInputSchema,
      outputSchema: attachmentDownloadUrlSchema,
      annotations: {
        ...readOnlyAnnotations,
        openWorldHint: true,
      },
    },
    async ({ attachmentId }) =>
      executeOperation(async () => {
        const attachment = await finance.getAttachmentDownloadInfo(attachmentId)
        const expiresInSeconds = 5 * 60
        const issuedAt = Date.now()
        const url = await createStorageClient().getSignedReadUrl(
          attachment.storageKey,
          expiresInSeconds,
        )

        return {
          attachmentId: attachment.id,
          filename: attachment.filename,
          contentType: attachment.contentType,
          url,
          expiresAt: new Date(issuedAt + expiresInSeconds * 1000).toISOString(),
        }
      }),
  )

  server.registerTool(
    'get_attachment_image',
    {
      title: 'View attachment as image',
      description:
        'Render an attachment as a viewable image and return a Markdown image link with a short-lived signed preview URL (e.g. ![Preview ...](https://...)). PDFs are rendered to a PNG (defaults to page 1; pass page for others). Callers should paste this Markdown directly into their response so the user sees it inline — do not rely on any native image content block. Use get_attachment_download_url only when the user explicitly needs the original file or a shareable download link.',
      inputSchema: attachmentImageInputSchema,
      annotations: {
        ...readOnlyAnnotations,
        openWorldHint: true,
      },
    },
    async ({ attachmentId, page }) =>
      executeImageOperation(() => buildAttachmentPreview(finance, attachmentId, page)),
  )

  server.registerTool(
    'link_attachment_to_transaction',
    {
      title: 'Link attachment to transaction',
      description:
        'Confirm a manual match by linking an attachment to a transaction. This replaces any existing suggestion or confirmed link on the attachment.',
      inputSchema: linkAttachmentInputSchema,
      outputSchema: attachmentMutationResultSchema,
      annotations: destructiveMutationAnnotations,
    },
    async ({ attachmentId, transactionId }) =>
      executeOperation(() => finance.linkAttachment(attachmentId, transactionId)),
  )

  server.registerTool(
    'approve_suggested_match',
    {
      title: 'Approve suggested match',
      description:
        'Confirm the attachment’s current suggested transaction match. Fails if the suggestion changed or no longer exists.',
      inputSchema: attachmentIdInputSchema,
      outputSchema: attachmentMutationResultSchema,
      annotations: destructiveMutationAnnotations,
    },
    async ({ attachmentId }) => executeOperation(() => finance.approveSuggestedMatch(attachmentId)),
  )

  server.registerTool(
    'dismiss_suggested_match',
    {
      title: 'Dismiss suggested match',
      description:
        'Reject the attachment’s current suggested transaction and return it to unmatched.',
      inputSchema: attachmentIdInputSchema,
      outputSchema: attachmentMutationResultSchema,
      annotations: destructiveMutationAnnotations,
    },
    async ({ attachmentId }) => executeOperation(() => finance.dismissSuggestedMatch(attachmentId)),
  )

  server.registerTool(
    'unlink_attachment',
    {
      title: 'Unlink attachment',
      description: 'Remove an attachment’s confirmed transaction link and return it to unmatched.',
      inputSchema: attachmentIdInputSchema,
      outputSchema: attachmentMutationResultSchema,
      annotations: destructiveMutationAnnotations,
    },
    async ({ attachmentId }) => executeOperation(() => finance.unlinkAttachment(attachmentId)),
  )

  server.registerTool(
    'ignore_attachment',
    {
      title: 'Ignore attachment',
      description:
        'Mark an unmatched or suggested attachment as ignored so it no longer needs matching. Linked attachments must be unlinked first.',
      inputSchema: attachmentIdInputSchema,
      outputSchema: attachmentMutationResultSchema,
      annotations: destructiveMutationAnnotations,
    },
    async ({ attachmentId }) => executeOperation(() => finance.ignoreAttachment(attachmentId)),
  )

  return server
}

function createPersonalFinanceMcpServer(context: Extract<FinanceMcpContext, { mode: 'personal' }>) {
  const server = new McpServer({
    name: 'hidden-village-personal-finance',
    version: '0.3.0',
  })
  const finance = new PersonalFinanceService({ workspaceId: context.workspaceId })

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
        'Read personal transactions using exact dates, amounts, direction, account, currency, or semantic text such as "video streaming". Results are newest first and cursor-paginated. Set includeInternalTransfers false for spending analysis.',
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
        'Calculate deterministic gross spending, refunds, and net spending grouped by original currency. Confirmed internal transfers are excluded by default. A semantic query can scope the summary, for example "streaming services".',
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
    accountId: input.accountId,
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

async function buildAttachmentPreview(finance: FinanceService, attachmentId: string, page: number) {
  const storage = createStorageClient()
  const attachment = await finance.getAttachmentDownloadInfo(attachmentId)
  const isPdf = attachment.contentType === 'application/pdf'
  const isImage = attachment.contentType.startsWith('image/')

  if (!isPdf && !isImage) {
    throw new Error('Attachment cannot be rendered as an image')
  }

  let previewUrl: string
  let totalPages: number | undefined

  if (isPdf) {
    // Cache the rendered page so repeat views (and Markdown-only clients that
    // re-fetch the URL) never re-run the pdfjs render.
    const key = `previews/${attachment.id}/page-${page}.png`

    if (!(await storage.objectExists(key))) {
      const originalBytes = await storage.getObjectBytes(attachment.storageKey)
      const rendered = await renderAttachmentImage({
        bytes: originalBytes,
        contentType: attachment.contentType,
        page,
      })
      await storage.putObject({ key, body: rendered.data, contentType: 'image/png' })
      totalPages = rendered.totalPages
    }

    previewUrl = await storage.getSignedReadUrl(key, PREVIEW_EXPIRES_SECONDS)
  } else {
    // Image attachments are already viewable files in storage, so the preview
    // URL points straight at the original — no render, download, or upload.
    previewUrl = await storage.getSignedReadUrl(attachment.storageKey, PREVIEW_EXPIRES_SECONDS)
  }

  const pageInfo = pageInfoText(isPdf ? page : undefined, totalPages)
  const altText = `Preview of ${attachment.filename}${pageInfo}`

  return {
    text: [
      `![${altText}](${previewUrl})`,
      '',
      `Inline preview of ${attachment.filename}${pageInfo}. Paste the Markdown image above into your reply so the user sees it inline. This preview link expires in ${PREVIEW_EXPIRES_MINUTES} minutes. Use get_attachment_download_url for the original file or a shareable download link.`,
    ].join('\n'),
  }
}

function pageInfoText(page: number | undefined, totalPages: number | undefined) {
  if (!page || (page === 1 && !totalPages)) {
    return ''
  }
  if (totalPages && totalPages > 1) {
    return ` (page ${page} of ${totalPages})`
  }
  if (totalPages === 1) {
    return ''
  }

  return ` (page ${page})`
}

async function executeImageOperation(
  operation: () => Promise<{
    text: string
  }>,
) {
  try {
    const { text } = await operation()

    return {
      content: [
        {
          type: 'text' as const,
          text,
        },
      ],
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

function safeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Finance request failed'
  }

  if (error.message.startsWith('Storage object not found')) {
    return 'Attachment file not found'
  }

  const safeMessages = [
    'Invalid pagination cursor',
    'No workspace exists',
    'Transaction not found',
    'Attachment not found',
    'Attachment has no suggested match to approve',
    'Attachment has no suggested match to dismiss',
    'Attachment is not linked to a transaction',
    'Linked attachments must be unlinked before they can be ignored',
    'Attachment changed before it could be linked',
    'Attachment changed before the suggestion could be approved',
    'Attachment changed before the suggestion could be dismissed',
    'Attachment changed before it could be unlinked',
    'Attachment changed before it could be ignored',
    'Attachment cannot be rendered as an image',
    'Requested page is out of range',
  ]

  if (safeMessages.includes(error.message)) {
    return error.message
  }

  return 'Finance request failed'
}
