import { queueNames, queues } from './queues'

const queueStates = ['waiting', 'delayed', 'active', 'completed', 'failed', 'paused'] as const

export async function getJobsDashboard() {
  const queueEntries = await Promise.all(
    Object.entries(queues).map(async ([key, queue]) => {
      const [counts, schedulers, jobs] = await Promise.all([
        queue.getJobCounts(...queueStates),
        queue.getJobSchedulers(0, 20, true),
        queue.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed'], 0, 20, false),
      ])

      return {
        name: key,
        queueName: queue.name,
        counts,
        schedulers: schedulers.map((scheduler) => ({
          key: scheduler.key,
          name: scheduler.name,
          next: scheduler.next,
          pattern: scheduler.pattern,
          every: scheduler.every,
        })),
        jobs: await Promise.all(
          jobs.map(async (job) => ({
            id: job.id ?? '',
            name: job.name,
            state: await job.getState(),
            attemptsMade: job.attemptsMade,
            failedReason: job.failedReason,
            timestamp: job.timestamp,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn,
          })),
        ),
      }
    }),
  )

  return {
    queues: queueEntries,
    queueNames,
  }
}
