import type { syncBankingTask } from '@bank-data/jobs'
import { createServerFn } from '@tanstack/react-start'
import { tasks } from '@trigger.dev/sdk'

import { authMiddleware } from '#/lib/middleware'

export const syncBankingNow = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async () => {
    const handle = await tasks.trigger<typeof syncBankingTask>('sync-banking', { overlapDays: 14 })

    return { id: handle.id }
  })
