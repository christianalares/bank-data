import { auth } from '@bank-data/auth'
import { createDb, workspace } from '@bank-data/db'
import { getRequest } from '@tanstack/react-start/server'

export async function getServerSession() {
  const request = getRequest()
  const session = await auth.api.getSession({
    headers: request.headers,
  })

  if (!session) {
    throw new Error('Unauthorized')
  }

  return session
}

export async function getOrCreateWorkspace(ownerId: string) {
  const db = createDb()
  const existingWorkspace = await db.query.workspace.findFirst({
    where: (table, { eq }) => eq(table.ownerId, ownerId),
  })

  if (existingWorkspace) {
    return existingWorkspace
  }

  const [createdWorkspace] = await db
    .insert(workspace)
    .values({
      name: 'Bank Data',
      ownerId,
    })
    .returning()

  return createdWorkspace
}
