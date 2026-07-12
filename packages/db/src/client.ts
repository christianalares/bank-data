import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

// Use a global symbol so the singleton survives across module re-evaluations
// (e.g. during hot reloads in development).
const GLOBAL_DB_KEY = Symbol.for('bank-data:db')

const globalObj = globalThis as typeof globalThis & {
  [GLOBAL_DB_KEY]?: ReturnType<typeof drizzle<typeof schema>>
}

export function createDb(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required')
  }

  if (!globalObj[GLOBAL_DB_KEY]) {
    const statementTimeout = getStatementTimeout()
    const client = postgres(connectionString, {
      max: 10,
      connect_timeout: 10,
      ...(statementTimeout
        ? {
            connection: {
              statement_timeout: statementTimeout,
            },
          }
        : {}),
    })
    globalObj[GLOBAL_DB_KEY] = drizzle(client, { schema })
  }

  return globalObj[GLOBAL_DB_KEY]
}

export type Database = ReturnType<typeof createDb>

function getStatementTimeout() {
  const configuredValue = process.env.DATABASE_STATEMENT_TIMEOUT_MS

  if (!configuredValue) {
    return undefined
  }

  const timeout = Number(configuredValue)

  if (!Number.isInteger(timeout) || timeout < 1) {
    throw new Error('DATABASE_STATEMENT_TIMEOUT_MS must be a positive integer')
  }

  return timeout
}
