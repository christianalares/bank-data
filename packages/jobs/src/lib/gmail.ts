import { createHash } from 'node:crypto'
import type { gmail_v1 } from 'googleapis'
import { google } from 'googleapis'

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  )
}

export async function refreshAccessToken(refreshToken: string) {
  const client = createOAuth2Client()
  client.setCredentials({ refresh_token: refreshToken })
  const { credentials } = await client.refreshAccessToken()
  return credentials
}

// Metadata only — no binary data loaded yet
export type GmailAttachmentMeta = {
  filename: string
  messageId: string
  attachmentId: string
  referenceId: string
}

type PdfPart = {
  filename: string
  attachmentId: string
}

// Gmail emails are multipart trees — attachments can be nested several levels deep
function collectPdfParts(parts: gmail_v1.Schema$MessagePart[]): PdfPart[] {
  const found: PdfPart[] = []

  for (const part of parts) {
    const mimeType = part.mimeType ?? ''
    const filename = part.filename ?? ''
    const attachmentId = part.body?.attachmentId

    if (filename && attachmentId) {
      const isPdf =
        mimeType === 'application/pdf' ||
        (mimeType === 'application/octet-stream' && filename.toLowerCase().endsWith('.pdf'))

      if (isPdf) {
        found.push({ filename, attachmentId })
      }
    }

    // Recurse into nested multipart sections
    if (part.parts && part.parts.length > 0) {
      found.push(...collectPdfParts(part.parts))
    }
  }

  return found
}

// Returns metadata only — call downloadPdfAttachment separately to load binary data
export async function listPdfAttachments(
  accessToken: string,
  lastSyncedAt: Date | null,
): Promise<GmailAttachmentMeta[]> {
  const client = createOAuth2Client()
  client.setCredentials({ access_token: accessToken })
  const gmail = google.gmail({ version: 'v1', auth: client })

  let dateFilter: string
  if (!lastSyncedAt) {
    const daysAgo = new Date()
    daysAgo.setDate(daysAgo.getDate() - 30)
    dateFilter = `after:${daysAgo.toISOString().split('T')[0]}`
  } else {
    // Subtract 1 day to be inclusive — Gmail's after: is exclusive
    const dayBefore = new Date(lastSyncedAt)
    dayBefore.setDate(dayBefore.getDate() - 1)
    dateFilter = `after:${dayBefore.toISOString().split('T')[0]}`
  }

  // Searches all mail (including archived) — no label filter intentional
  const query = `-from:me has:attachment filename:pdf ${dateFilter}`

  const allMessageIds: string[] = []
  let nextPageToken: string | undefined
  let pagesFetched = 0
  const maxPages = 3

  do {
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 50,
      q: query,
      pageToken: nextPageToken,
    })

    for (const msg of listResponse.data.messages ?? []) {
      if (msg.id) {
        allMessageIds.push(msg.id)
      }
    }

    nextPageToken = listResponse.data.nextPageToken ?? undefined
    pagesFetched++
  } while (nextPageToken && allMessageIds.length < 150 && pagesFetched < maxPages)

  const results: GmailAttachmentMeta[] = []

  for (const messageId of allMessageIds) {
    const msg = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' })

    const topLevelParts: gmail_v1.Schema$MessagePart[] = []
    if (msg.data.payload) {
      topLevelParts.push(msg.data.payload)
      if (msg.data.payload.parts) {
        topLevelParts.push(...msg.data.payload.parts)
      }
    }
    const pdfParts = collectPdfParts(topLevelParts).slice(0, 5)

    for (const { filename, attachmentId } of pdfParts) {
      const referenceId = createHash('sha256').update(`${messageId}_${filename}`).digest('hex')
      results.push({ filename, messageId, attachmentId, referenceId })
    }
  }

  return results
}

// Downloads the binary data for a single attachment — call after dedup check
export async function downloadPdfAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const client = createOAuth2Client()
  client.setCredentials({ access_token: accessToken })
  const gmail = google.gmail({ version: 'v1', auth: client })

  const attResponse = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  })

  const base64Data = attResponse.data.data
  if (!base64Data) {
    throw new Error(`No data returned for attachment ${attachmentId} in message ${messageId}`)
  }

  // Gmail returns URL-safe base64 — normalize to standard base64
  const normalized = base64Data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64')
}
