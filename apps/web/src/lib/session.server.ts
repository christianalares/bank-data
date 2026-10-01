import { getRequest } from '@tanstack/react-start/server'
import { auth } from '#auth'

export async function fetchSession() {
  const request = getRequest()
  return auth.api.getSession({ headers: request.headers })
}
