import { type MistralLanguageModelOptions, mistral } from '@ai-sdk/mistral'
import { logger, schemaTask } from '@trigger.dev/sdk'
import { generateText, Output } from 'ai'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { attachment, createDb, parsedInvoiceSchema } from '#db'
import { createStorageClient } from '#storage'

import { matchPendingAttachmentsTask } from './match-pending-attachments'

const payloadSchema = z.object({
  attachmentStorageKey: z.string(),
  correlationId: z.uuid(),
  workspaceId: z.uuid(),
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']),
})

export type ProcessAttachmentPayload = z.infer<typeof payloadSchema>

export const processAttachmentTask = schemaTask({
  id: 'process-attachment',
  schema: payloadSchema,
  queue: { concurrencyLimit: 1 },
  retry: {
    maxAttempts: 6,
    minTimeoutInMs: 10_000,
    maxTimeoutInMs: 60_000,
    factor: 2,
    randomize: true,
  },
  run: async (payload) => {
    logger.info('Downloading attachment', { key: payload.attachmentStorageKey })

    const storage = createStorageClient()
    const fileBytes = await storage.getObjectBytes(payload.attachmentStorageKey)

    const isImage = payload.contentType.startsWith('image/')

    logger.info('Extracting text from attachment', {
      bytes: fileBytes.byteLength,
      contentType: payload.contentType,
    })

    const fileContentPart = isImage
      ? ({ type: 'image' as const, image: fileBytes, mediaType: payload.contentType } as const)
      : ({ type: 'file' as const, data: fileBytes, mediaType: 'application/pdf' as const } as const)

    let parsedInvoice = null

    try {
      // Single call: read the document and emit the structured invoice directly,
      // rather than a separate OCR-to-text pass followed by a structuring pass.
      const { output } = await generateText({
        model: mistral(isImage ? 'pixtral-12b-latest' : 'mistral-small-latest'),
        maxRetries: 5,
        output: Output.object({ schema: parsedInvoiceSchema }),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract the invoice or receipt data from this document. Preserve numbers, dates, and amounts exactly as they appear. Return null for any field that is not present or cannot be determined with confidence.',
              },
              fileContentPart,
            ],
          },
        ],
        ...(!isImage && {
          providerOptions: {
            mistral: {
              documentImageLimit: 8,
              // Most invoices are 1-3 pages; limit prevents huge bank statements
              // from blowing the context window
              documentPageLimit: 10,
            } satisfies MistralLanguageModelOptions,
          },
        }),
      })

      parsedInvoice = output ?? null
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const isContextLengthError =
        message.includes('too large for model') || message.includes('maximum context length')

      if (isContextLengthError) {
        logger.warn('Document too large for AI extraction — storing without parsed data', {
          correlationId: payload.correlationId,
          bytes: fileBytes.byteLength,
        })
      } else {
        // Re-throw anything that isn't a context length error so Trigger retries it
        throw err
      }
    }

    logger.info('Storing parsed invoice on attachment', {
      correlationId: payload.correlationId,
      parsedInvoice,
    })

    const db = createDb()

    await db
      .update(attachment)
      .set({ parsedInvoice: parsedInvoice ?? null })
      .where(eq(attachment.id, payload.correlationId))

    await matchPendingAttachmentsTask.trigger({ workspaceId: payload.workspaceId })

    return {
      correlationId: payload.correlationId,
      attachmentStorageKey: payload.attachmentStorageKey,
      parsedInvoice,
    }
  },
})
