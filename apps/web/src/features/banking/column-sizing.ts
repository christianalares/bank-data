import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import type { ColumnSizingState } from '@tanstack/react-table'

const COOKIE_NAME = 'transactions-column-sizing'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10 // 10 years

export const getTransactionColumnSizing = createServerFn({ method: 'GET' }).handler(
  (): ColumnSizingState => {
    try {
      const request = getRequest()
      const cookieHeader = request.headers.get('cookie') ?? ''
      const match = cookieHeader.split('; ').find((c) => c.startsWith(`${COOKIE_NAME}=`))
      if (!match) {
        return {}
      }
      const value = match.slice(COOKIE_NAME.length + 1)
      return JSON.parse(decodeURIComponent(value)) as ColumnSizingState
    } catch {
      return {}
    }
  },
)

export function saveTransactionColumnSizing(sizing: ColumnSizingState): void {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(sizing))}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}
