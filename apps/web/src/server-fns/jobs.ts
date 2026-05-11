import { auth } from '@bank-data/auth'
import { enqueueEnableBankingSyncNow, getJobsDashboard } from '@bank-data/jobs'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

export const getDashboard = createServerFn({ method: 'GET' }).handler(async () => {
  await requireServerSession()

  return getJobsDashboard()
})

export const syncBankingNow = createServerFn({ method: 'POST' }).handler(async () => {
  await requireServerSession()
  const job = await enqueueEnableBankingSyncNow({
    overlapDays: 14,
  })

  return {
    id: job.id,
  }
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
