import { type MistralLanguageModelOptions, mistral } from '@ai-sdk/mistral'
import { attachment, createDb, parsedInvoiceSchema } from '@bank-data/db'
import { createStorageClient } from '@bank-data/storage'
import { logger, schemaTask } from '@trigger.dev/sdk'
import { generateText, Output } from 'ai'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

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

    const { text: extractedText } = await generateText({
      model: mistral(isImage ? 'pixtral-12b-latest' : 'mistral-small-latest'),
      maxRetries: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract all text content from this document. Preserve numbers, dates, and amounts exactly as they appear.',
            },
            fileContentPart,
          ],
        },
      ],
      ...(!isImage && {
        providerOptions: {
          mistral: {
            documentImageLimit: 8,
            documentPageLimit: 64,
          } satisfies MistralLanguageModelOptions,
        },
      }),
    })

    logger.info('Structuring extracted text', { chars: extractedText.length })

    const { output: parsedInvoice } = await generateText({
      model: mistral('mistral-large-latest'),
      maxRetries: 0,
      output: Output.object({ schema: parsedInvoiceSchema }),
      prompt: `Extract the invoice or receipt data from the following document text. Return null for any field that is not present or cannot be determined with confidence.\n\n${extractedText}`,
    })

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
