import { createFileRoute, redirect } from '@tanstack/react-router'

import { AppShell } from '#/components/app-shell'
import { DashboardContent } from '#/components/dashboard-content'
import { getCurrentSession } from '#/lib/session'

export const Route = createFileRoute('/')({
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
  component: Home,
})

function Home() {
  return (
    <AppShell>
      <DashboardContent />
    </AppShell>
  )
}
