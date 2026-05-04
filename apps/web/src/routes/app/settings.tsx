import { createFileRoute } from '@tanstack/react-router'

import { ModulePage } from '#/components/module-page'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'

export const Route = createFileRoute('/app/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <ModulePage
      title="Settings"
      description="Private workspace, auth, connector, and deployment configuration."
      status="placeholder"
    >
      <Card>
        <CardHeader>
          <CardTitle>Environment contract</CardTitle>
          <CardDescription>
            Local development and Railway will use the same environment variable names.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            {[
              'DATABASE_URL',
              'REDIS_URL',
              'BETTER_AUTH_URL',
              'S3_BUCKET',
              'GOCARDLESS_SECRET_ID',
              'GOOGLE_CLIENT_ID',
            ].map((name) => (
              <div key={name} className="rounded-lg border bg-muted/30 p-3">
                <dt className="font-mono text-xs text-muted-foreground">{name}</dt>
                <dd>Configured outside source control</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </ModulePage>
  )
}
