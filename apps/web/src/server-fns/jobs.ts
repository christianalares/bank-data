import { auth } from '@bank-data/auth'
import type { syncBankingTask } from '@bank-data/jobs'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { tasks } from '@trigger.dev/sdk'

export const syncBankingNow = createServerFn({ method: 'POST' }).handler(async () => {
  await requireServerSession()
  const handle = await tasks.trigger<typeof syncBankingTask>('sync-banking', { overlapDays: 14 })

  return { id: handle.id }
})

async function requireServerSession() {
  const request = getRequest()
  const session = await auth.api.getSession({
    headers: request.headers,
  })

  if (!session) {
    throw new Error('Unauthorized')
  }

  return session
}
