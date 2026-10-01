import { createFileRoute } from '@tanstack/react-router'
import { google } from 'googleapis'
import { auth } from '#auth'

function getAuthUrl(): string {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  )
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  })
}

export const Route = createFileRoute('/api/gmail/connect')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers })

        if (!session) {
          return Response.redirect(new URL('/login', request.url), 302)
        }

        return Response.redirect(getAuthUrl(), 302)
      },
    },
  },
})
