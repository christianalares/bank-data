import { createFileRoute } from '@tanstack/react-router'
import { tasks } from '@trigger.dev/sdk'
import { google } from 'googleapis'
import { getOrCreateWorkspace } from '#/features/banking/shared'
import { encrypt } from '#/lib/crypto'
import { auth } from '#auth'
import { createDb, gmailConnection } from '#db'
import type { syncGmailInboxTask } from '#jobs'

async function exchangeCode(code: string) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  )
  const { tokens } = await client.getToken(code)
  return { client, tokens }
}

async function getUserEmail(accessToken: string): Promise<string> {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  )
  client.setCredentials({ access_token: accessToken })
  const oauth2 = google.oauth2({ version: 'v2', auth: client })
  const { data } = await oauth2.userinfo.get()
  if (!data.email) {
    throw new Error('Could not retrieve email from Google')
  }
  return data.email
}

export const Route = createFileRoute('/api/gmail/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const error = url.searchParams.get('error')
        const inboxUrl = new URL('/inbox', url.origin)

        if (error || !code) {
          inboxUrl.searchParams.set('gmailError', error ?? 'missing_code')
          return Response.redirect(inboxUrl, 302)
        }

        const session = await auth.api.getSession({ headers: request.headers })
        if (!session) {
          return Response.redirect(new URL('/login', url.origin), 302)
        }

        try {
          const { tokens } = await exchangeCode(code)

          if (!tokens.access_token) {
            throw new Error('No access token returned from Google')
          }

          const email = await getUserEmail(tokens.access_token)

          const db = createDb()
          const businessWorkspace = await getOrCreateWorkspace(session.user.id, 'business')

          // Upsert — single row, delete any previous connection first
          await db.delete(gmailConnection)
          await db.insert(gmailConnection).values({
            workspaceId: businessWorkspace.id,
            email,
            accessToken: encrypt(tokens.access_token),
            refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
            expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          })

          // Kick off an immediate first sync
          await tasks.trigger<typeof syncGmailInboxTask>('sync-gmail-inbox', undefined)

          inboxUrl.searchParams.set('gmailConnected', '1')
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Gmail connection failed'
          inboxUrl.searchParams.set('gmailError', message)
        }

        return Response.redirect(inboxUrl, 302)
      },
    },
  },
})
