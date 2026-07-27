import { createDb, workspace } from '@hidden-village/db'

export type WorkspaceKind = 'business' | 'personal'

export async function getOrCreateWorkspace(ownerId: string, kind: WorkspaceKind = 'business') {
  const db = createDb()
  const existingWorkspace = await db.query.workspace.findFirst({
    where: (table, { and, eq }) => and(eq(table.ownerId, ownerId), eq(table.kind, kind)),
  })

  if (existingWorkspace) {
    return existingWorkspace
  }

  const [createdWorkspace] = await db
    .insert(workspace)
    .values({
      name: kind === 'personal' ? 'Personal' : 'Hidden Village',
      kind,
      ownerId,
    })
    .onConflictDoNothing({
      target: [workspace.ownerId, workspace.kind],
    })
    .returning()

  if (createdWorkspace) {
    return createdWorkspace
  }

  const racedWorkspace = await db.query.workspace.findFirst({
    where: (table, { and, eq }) => and(eq(table.ownerId, ownerId), eq(table.kind, kind)),
  })

  if (!racedWorkspace) {
    throw new Error(`Could not create ${kind} workspace`)
  }

  return racedWorkspace
}
