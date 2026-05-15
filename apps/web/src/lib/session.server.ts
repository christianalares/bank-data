import { auth } from '@bank-data/auth'
import { getRequest } from '@tanstack/react-start/server'

export async function fetchSession() {
  const request = getRequest()
  return auth.api.getSession({ headers: request.headers })
}
