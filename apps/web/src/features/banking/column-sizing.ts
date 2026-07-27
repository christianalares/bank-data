import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import type { ColumnSizingState } from '@tanstack/react-table'

const BUSINESS_COOKIE_NAME = 'transactions-column-sizing'
const PERSONAL_COOKIE_NAME = 'personal-transactions-column-sizing'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10 // 10 years

export const getTransactionColumnSizing = createServerFn({ method: 'GET' }).handler(
  (): ColumnSizingState => getColumnSizing(BUSINESS_COOKIE_NAME),
)

export function saveTransactionColumnSizing(sizing: ColumnSizingState): void {
  saveColumnSizing(BUSINESS_COOKIE_NAME, sizing)
}

export const getPersonalTransactionColumnSizing = createServerFn({ method: 'GET' }).handler(
  (): ColumnSizingState => getColumnSizing(PERSONAL_COOKIE_NAME),
)

export function savePersonalTransactionColumnSizing(sizing: ColumnSizingState): void {
  saveColumnSizing(PERSONAL_COOKIE_NAME, sizing)
}

function getColumnSizing(cookieName: string): ColumnSizingState {
  try {
    const request = getRequest()
    const cookieHeader = request.headers.get('cookie') ?? ''
    const match = cookieHeader.split('; ').find((cookie) => cookie.startsWith(`${cookieName}=`))
    if (!match) {
      return {}
    }
    const value = match.slice(cookieName.length + 1)
    return JSON.parse(decodeURIComponent(value)) as ColumnSizingState
  } catch {
    return {}
  }
}

function saveColumnSizing(cookieName: string, sizing: ColumnSizingState): void {
  document.cookie = `${cookieName}=${encodeURIComponent(JSON.stringify(sizing))}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}
