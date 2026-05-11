import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { mutations } from '#/mutations'
import { queries } from '#/queries'

export const Route = createFileRoute('/_protected/jobs')({
  loader: ({ context }) => context.queryClient.ensureQueryData(queries.jobs.dashboard()),
  component: JobsPage,
})

const dateFormatter = new Intl.DateTimeFormat('en-SE', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function JobsPage() {
  const queryClient = useQueryClient()
  const { data } = useSuspenseQuery(queries.jobs.dashboard())
  const syncBankingMutation = useMutation({
    ...mutations.jobs.syncBankingNow(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['jobs'],
      })
      toast.success('Banking sync queued')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not queue banking sync'
      toast.error(message)
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-3xl font-semibold tracking-tight">Jobs</h1>
            <Badge variant="outline">BullMQ</Badge>
          </div>
          <p className="max-w-2xl text-muted-foreground">
            Scheduled jobs, queue counts, and recent worker activity.
          </p>
        </div>
        <Button
          type="button"
          disabled={syncBankingMutation.isPending}
          onClick={() => {
            syncBankingMutation.mutate()
          }}
        >
          {syncBankingMutation.isPending ? 'Queueing...' : 'Sync banking now'}
        </Button>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {data.queues.map((queue) => (
          <Card key={queue.name}>
            <CardHeader>
              <CardTitle>{queue.queueName}</CardTitle>
              <CardDescription>Current queue counts</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-3 gap-2">
                {Object.entries(queue.counts).map(([state, count]) => (
                  <div key={state} className="border p-2">
                    <dt className="text-muted-foreground">{state}</dt>
                    <dd className="font-heading text-xl font-semibold">{count}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scheduled jobs</CardTitle>
          <CardDescription>Recurring jobs registered with BullMQ job schedulers.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Queue</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Next run</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.queues.flatMap((queue) =>
                queue.schedulers.map((scheduler) => (
                  <TableRow key={`${queue.name}:${scheduler.key}`}>
                    <TableCell>{queue.queueName}</TableCell>
                    <TableCell>{scheduler.name ?? scheduler.key}</TableCell>
                    <TableCell>{scheduler.pattern ?? formatEvery(scheduler.every)}</TableCell>
                    <TableCell>{formatDate(scheduler.next)}</TableCell>
                  </TableRow>
                )),
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent jobs</CardTitle>
          <CardDescription>Most recent jobs across all queues.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Queue</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Failure</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.queues.flatMap((queue) =>
                queue.jobs.map((job) => (
                  <TableRow key={`${queue.name}:${job.id}`}>
                    <TableCell>{queue.queueName}</TableCell>
                    <TableCell>{job.name}</TableCell>
                    <TableCell>
                      <Badge variant={job.state === 'failed' ? 'destructive' : 'secondary'}>
                        {job.state}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(job.timestamp)}</TableCell>
                    <TableCell className="max-w-96 truncate">{job.failedReason ?? ''}</TableCell>
                  </TableRow>
                )),
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function formatDate(timestamp: number | undefined) {
  if (!timestamp) {
    return 'Not scheduled'
  }

  return dateFormatter.format(new Date(timestamp))
}

function formatEvery(every: number | undefined) {
  if (!every) {
    return 'Manual'
  }

  return `Every ${Math.round(every / 1000)}s`
}
