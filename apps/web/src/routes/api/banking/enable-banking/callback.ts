import { createFileRoute } from '@tanstack/react-router'

import { completeEnableBankingAuthorization } from '#/features/banking/server'

export const Route = createFileRoute('/api/banking/enable-banking/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const error = url.searchParams.get('error')
        const redirectUrl = new URL('/transactions', url.origin)

        if (error) {
          redirectUrl.searchParams.set('enableBanking', 'error')
          redirectUrl.searchParams.set('message', error)

          return Response.redirect(redirectUrl, 302)
        }

        if (!code || !state) {
          redirectUrl.searchParams.set('enableBanking', 'error')
          redirectUrl.searchParams.set('message', 'Missing Enable Banking callback parameters')

          return Response.redirect(redirectUrl, 302)
        }

        try {
          const result = await completeEnableBankingAuthorization({
            data: {
              code,
              state,
            },
          })

          redirectUrl.searchParams.set('enableBanking', 'connected')
          redirectUrl.searchParams.set('accounts', String(result.syncedAccounts))
          redirectUrl.searchParams.set('transactions', String(result.syncedTransactions))
        } catch (caughtError) {
          const message =
            caughtError instanceof Error ? caughtError.message : 'Enable Banking callback failed'

          redirectUrl.searchParams.set('enableBanking', 'error')
          redirectUrl.searchParams.set('message', message)
        }

        return Response.redirect(redirectUrl, 302)
      },
    },
  },
})
