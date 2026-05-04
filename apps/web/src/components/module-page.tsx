import type { ReactNode } from 'react'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'

type Stat = {
  label: string
  value: string
  description: string
}

type ModulePageProps = {
  title: string
  description: string
  status: 'foundation' | 'placeholder' | 'ready'
  stats?: Stat[]
  children?: ReactNode
}

const statusLabel = {
  foundation: 'Foundation',
  placeholder: 'Placeholder',
  ready: 'Ready',
}

export function ModulePage({ title, description, status, stats = [], children }: ModulePageProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-3xl font-semibold tracking-tight">{title}</h1>
            <Badge variant="outline">{statusLabel[status]}</Badge>
          </div>
          <p className="max-w-2xl text-muted-foreground">{description}</p>
        </div>
      </div>

      {stats.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-3">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader>
                <CardTitle>{stat.label}</CardTitle>
                <CardDescription>{stat.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="font-heading text-3xl font-semibold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {children ?? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing here yet</CardTitle>
            <CardDescription>
              This module is scaffolded so the product shape is visible early.
            </CardDescription>
            <CardAction>
              <Badge variant="secondary">Next slice</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>Implementation pending</EmptyTitle>
                <EmptyDescription>
                  The route, navigation, and module boundary exist. The next Beads slice fills in
                  the real workflow.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" disabled>
                  Coming soon
                </Button>
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
