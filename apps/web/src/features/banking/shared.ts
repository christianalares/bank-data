import { createDb, workspace } from '@bank-data/db'

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
