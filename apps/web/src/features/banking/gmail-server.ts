import { createDb, gmailConnection } from '@hidden-village/db'
import type { syncGmailInboxTask } from '@hidden-village/jobs'
import { createServerFn } from '@tanstack/react-start'
import { tasks } from '@trigger.dev/sdk'
import { eq } from 'drizzle-orm'
import { getOrCreateWorkspace } from '#/features/banking/shared'
import { authMiddleware } from '#/lib/middleware'

export const getGmailConnection = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = createDb()
    const businessWorkspace = await getOrCreateWorkspace(context.session.user.id, 'business')
    const connection = await db.query.gmailConnection.findFirst({
      where: (table, { eq }) => eq(table.workspaceId, businessWorkspace.id),
    })

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
  .handler(async ({ context }) => {
    const db = createDb()
    const businessWorkspace = await getOrCreateWorkspace(context.session.user.id, 'business')
    await db.delete(gmailConnection).where(eq(gmailConnection.workspaceId, businessWorkspace.id))
    return { ok: true }
  })

export const triggerGmailSync = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async () => {
    await tasks.trigger<typeof syncGmailInboxTask>('sync-gmail-inbox', undefined)
    return { ok: true }
  })
