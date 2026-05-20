import { createDb, gmailConnection } from '@bank-data/db'
import type { syncGmailInboxTask } from '@bank-data/jobs'
import { createServerFn } from '@tanstack/react-start'
import { tasks } from '@trigger.dev/sdk'
import { authMiddleware } from '#/lib/middleware'

export const getGmailConnection = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async () => {
    const db = createDb()
    const connection = await db.query.gmailConnection.findFirst()

    if (!connection) {
      return null
    }

    return {
      email: connection.email,
      lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
      connectedAt: connection.createdAt.toISOString(),
    }
  })

export const disconnectGmail = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async () => {
    const db = createDb()
    await db.delete(gmailConnection)
    return { ok: true }
  })

export const triggerGmailSync = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async () => {
    await tasks.trigger<typeof syncGmailInboxTask>('sync-gmail-inbox', undefined)
    return { ok: true }
  })
