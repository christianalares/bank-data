import { mistral } from '@ai-sdk/mistral'
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
})

export type ProcessAttachmentPayload = z.infer<typeof payloadSchema>

export const processAttachmentTask = schemaTask({
  id: 'process-attachment',
  schema: payloadSchema,
  run: async (payload) => {
    logger.info('Downloading attachment', { key: payload.attachmentStorageKey })

    const storage = createStorageClient()
    const pdfBytes = await storage.getObjectBytes(payload.attachmentStorageKey)

    logger.info('Extracting text from PDF', { bytes: pdfBytes.byteLength })

    const { text: extractedText } = await generateText({
      model: mistral('mistral-small-latest'),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract all text content from this document. Preserve numbers, dates, and amounts exactly as they appear.',
            },
            {
              type: 'file',
              data: pdfBytes,
              mediaType: 'application/pdf',
            },
          ],
        },
      ],
    })

    logger.info('Structuring extracted text', { chars: extractedText.length })

    const { output: parsedInvoice } = await generateText({
      model: mistral('mistral-large-latest'),
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
