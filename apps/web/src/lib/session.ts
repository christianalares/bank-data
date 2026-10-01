import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '#auth'

export const getCurrentSession = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const session = await auth.api.getSession({ headers: request.headers })

  if (!session) {
    return null
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
    },
  }
})
