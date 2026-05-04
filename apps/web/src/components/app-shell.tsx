import { Link, Outlet } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { Badge } from '#/components/ui/badge'
import { Separator } from '#/components/ui/separator'

const navigation = [
  { to: '/', label: 'Dashboard' },
  { to: '/tracker', label: 'Tracker' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/inbox', label: 'Inbox' },
  { to: '/exports', label: 'Exports' },
  { to: '/settings', label: 'Settings' },
] as const

export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Link to="/" className="font-heading text-xl font-semibold">
                Bank Data
              </Link>
              <Badge variant="secondary">Private</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Personal time tracking, transactions, inbox matching, and accountant exports.
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            {navigation.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{ 'data-active': true }}
                className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[active=true]:bg-muted data-[active=true]:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        {children ?? <Outlet />}
      </main>
      <Separator />
      <footer className="mx-auto max-w-6xl px-6 py-6 text-sm text-muted-foreground">
        Built as a private app. No SaaS surface area, no team billing, no public API.
      </footer>
    </div>
  )
}
