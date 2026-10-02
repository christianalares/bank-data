import { Outlet, useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { AppSidebar } from '#/components/layout/app-sidebar'
import { ModeToggle } from '#/components/mode-toggle'
import { Separator } from '#/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '#/components/ui/sidebar'
import { TooltipProvider } from '#/components/ui/tooltip'

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/transactions': 'Transactions',
  '/tracker': 'Tracker',
  '/inbox': 'Inbox',
  '/exports': 'Exports',
  '/settings': 'Settings',
  '/personal/transactions': 'Personal Transactions',
  '/personal/connections': 'Personal Connections',
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { location } = useRouterState()
  const pageTitle = getPageTitle(location.pathname)

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
            />
            <p className="text-sm font-medium">{pageTitle}</p>
            <div className="ml-auto flex items-center gap-2">
              <ModeToggle />
            </div>
          </header>
          <main className="flex flex-1 flex-col overflow-y-auto">
            <div className="flex w-full flex-col gap-6 px-6 py-8">{children ?? <Outlet />}</div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}

function getPageTitle(pathname: string) {
  if (pageTitles[pathname]) {
    return pageTitles[pathname]
  }

  const prefix = Object.keys(pageTitles).find((key) => key !== '/' && pathname.startsWith(key))

  return prefix ? pageTitles[prefix] : 'Bank Data'
}
