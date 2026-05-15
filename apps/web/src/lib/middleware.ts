import { redirect } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'
import { fetchSession } from './session.server'

export const authMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const session = await fetchSession()

  if (!session) {
    throw redirect({ to: '/login' })
  }

  return next({ context: { session } })
})
