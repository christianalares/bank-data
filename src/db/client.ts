import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

// Use a global symbol so the singleton survives across module re-evaluations
// (e.g. during hot reloads in development).
const GLOBAL_DB_KEY = Symbol.for('hidden-village:db')
const GLOBAL_DB_CLIENT_KEY = Symbol.for('hidden-village:db-client')

const globalObj = globalThis as typeof globalThis & {
  [GLOBAL_DB_KEY]?: ReturnType<typeof drizzle<typeof schema>>
  [GLOBAL_DB_CLIENT_KEY]?: ReturnType<typeof postgres>
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
    globalObj[GLOBAL_DB_CLIENT_KEY] = client
    globalObj[GLOBAL_DB_KEY] = drizzle(client, { schema })
  }

  return globalObj[GLOBAL_DB_KEY]
}

export type Database = ReturnType<typeof createDb>

export async function closeDb() {
  const client = globalObj[GLOBAL_DB_CLIENT_KEY]
  if (!client) {
    return
  }

  await client.end()
  delete globalObj[GLOBAL_DB_CLIENT_KEY]
  delete globalObj[GLOBAL_DB_KEY]
}

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
