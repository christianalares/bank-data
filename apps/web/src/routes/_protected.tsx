import { createFileRoute, redirect } from '@tanstack/react-router'

import { AppShell } from '#/components/app-shell'
import { getCurrentSession } from '#/lib/session'

export const Route = createFileRoute('/_protected')({
  beforeLoad: async ({ location }) => {
    const session = await getCurrentSession()

    if (!session) {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
        },
      })
    }
  },
  component: AppShell,
})
