import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { mutations } from '#/mutations'

export const Route = createFileRoute('/_protected/jobs')({
  component: JobsPage,
})

function JobsPage() {
  const syncBankingMutation = useMutation({
    ...mutations.jobs.syncBankingNow(),
    onSuccess: () => {
      toast.success('Banking sync triggered')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not trigger banking sync'
      toast.error(message)
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-3xl font-semibold tracking-tight">Jobs</h1>
            <Badge variant="outline">Trigger.dev</Badge>
          </div>
          <p className="max-w-2xl text-muted-foreground">
            Background jobs are managed by Trigger.dev. Monitor runs in the Trigger.dev dashboard.
          </p>
        </div>
        <Button
          type="button"
          disabled={syncBankingMutation.isPending}
          onClick={() => syncBankingMutation.mutate()}
        >
          {syncBankingMutation.isPending ? 'Triggering...' : 'Sync banking now'}
        </Button>
      </section>
    </div>
  )
}
