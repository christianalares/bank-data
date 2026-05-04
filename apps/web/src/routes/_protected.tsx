import { createFileRoute, redirect } from '@tanstack/react-router'

import { AlertProvider } from '#/components/alerts'
import { AppShell } from '#/components/app-shell'
import { ModalProvider } from '#/components/modals'
import { SheetProvider } from '#/components/sheets'
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
  component: ProtectedLayout,
})

function ProtectedLayout() {
  return (
    <>
      <SheetProvider />
      <AlertProvider />
      <ModalProvider />
      <AppShell />
    </>
  )
}
