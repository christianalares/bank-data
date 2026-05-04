import { createFileRoute } from '@tanstack/react-router'

import { ModulePage } from '#/components/module-page'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'

export const Route = createFileRoute('/_protected/tracker')({
  component: TrackerPage,
})

function TrackerPage() {
  return (
    <ModulePage
      title="Tracker"
      description="Projects and time entries are the first real domain model in Bank Data."
      status="foundation"
      stats={[
        {
          label: 'Projects',
          value: '0',
          description: 'Create project UI lands in the tracker CRUD slice.',
        },
        {
          label: 'Open timer',
          value: 'No',
          description: 'Only one running timer will be allowed per user.',
        },
        {
          label: 'Billable value',
          value: '0 SEK',
          description: 'Calculated from duration and project hourly rate.',
        },
      ]}
    >
      <Card>
        <CardHeader>
          <CardTitle>Tracker foundation</CardTitle>
          <CardDescription>
            Workspace, project, and time entry schema are ready for CRUD screens and summaries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The next tracker slice will add project forms, manual time entry forms, editing,
            deletion, and range summaries.
          </p>
        </CardContent>
        <CardFooter className="gap-2">
          <Button disabled>Start timer</Button>
          <Button variant="outline" disabled>
            Add manual entry
          </Button>
        </CardFooter>
      </Card>
    </ModulePage>
  )
}
