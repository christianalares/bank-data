import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, gte, lt } from 'drizzle-orm'
import { getOrCreateWorkspace } from '#/features/banking/shared'
import { authMiddleware } from '#/lib/middleware'
import { createDb, timeEntry, trackerProject } from '#db'

type TrackerYearInput = {
  year?: number
}

type ProjectInput = {
  id?: string
  name: string
  hourlyRate?: string | null
  currency?: string
  billable?: boolean
  archived?: boolean
}

type TimeEntryInput = {
  id?: string
  projectId?: string | null
  description?: string | null
  date: string
  startTime: string
  stopTime: string
  billable?: boolean
}

type DeleteTimeEntryInput = {
  id: string
}

type DeleteProjectInput = {
  id: string
}

export const getTrackerYear = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator((input: TrackerYearInput | undefined) => ({
    year: input?.year,
  }))
  .handler(async ({ data, context }) => {
    const db = createDb()
    const year = getYear(data.year)
    const yearStart = new Date(year, 0, 1)
    const yearEnd = new Date(year + 1, 0, 1)
    const ownerWorkspace = await getOrCreateWorkspace(context.session.user.id)

    const [projects, entries] = await Promise.all([
      db.query.trackerProject.findMany({
        where: (table, { eq }) => eq(table.workspaceId, ownerWorkspace.id),
        orderBy: (table) => [asc(table.name)],
      }),
      db.query.timeEntry.findMany({
        where: (table) =>
          and(
            eq(table.workspaceId, ownerWorkspace.id),
            gte(table.startedAt, yearStart),
            lt(table.startedAt, yearEnd),
          ),
        orderBy: (table) => [asc(table.startedAt)],
      }),
    ])

    const projectById = new Map(projects.map((project) => [project.id, project]))

    return {
      year,
      currency: ownerWorkspace.baseCurrency,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        hourlyRate: project.hourlyRate,
        currency: project.currency,
        billable: project.billable,
        archived: project.archived,
      })),
      entries: entries.map((entry) => {
        const project = entry.projectId ? projectById.get(entry.projectId) : undefined

        return {
          id: entry.id,
          projectId: entry.projectId,
          projectName: project?.name ?? 'No project',
          description: entry.description,
          startedAt: entry.startedAt.toISOString(),
          stoppedAt: entry.stoppedAt?.toISOString() ?? null,
          durationSeconds: entry.durationSeconds,
          billable: entry.billable,
        }
      }),
    }
  })

export const saveTrackerProject = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((input: ProjectInput) => input)
  .handler(async ({ data, context }) => {
    const db = createDb()
    const ownerWorkspace = await getOrCreateWorkspace(context.session.user.id)
    const now = new Date()
    const values = {
      name: data.name.trim(),
      hourlyRate: normalizeHourlyRate(data.hourlyRate),
      currency: (data.currency?.trim() || ownerWorkspace.baseCurrency).toUpperCase(),
      billable: data.billable ?? true,
      archived: data.archived ?? false,
      updatedAt: now,
    }

    if (!values.name) {
      throw new Error('Project name is required')
    }

    if (data.id) {
      await db
        .update(trackerProject)
        .set(values)
        .where(
          and(eq(trackerProject.id, data.id), eq(trackerProject.workspaceId, ownerWorkspace.id)),
        )

      return { ok: true }
    }

    await db.insert(trackerProject).values({
      ...values,
      workspaceId: ownerWorkspace.id,
      createdAt: now,
    })

    return { ok: true }
  })

export const deleteTrackerProject = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((input: DeleteProjectInput) => input)
  .handler(async ({ data, context }) => {
    const db = createDb()
    const ownerWorkspace = await getOrCreateWorkspace(context.session.user.id)
    const project = await db.query.trackerProject.findFirst({
      where: (table, { and, eq }) =>
        and(eq(table.id, data.id), eq(table.workspaceId, ownerWorkspace.id)),
    })

    if (!project) {
      throw new Error('Project not found')
    }

    if (!project.archived) {
      throw new Error('Project must be archived before it can be deleted')
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(timeEntry)
        .where(and(eq(timeEntry.workspaceId, ownerWorkspace.id), eq(timeEntry.projectId, data.id)))

      await tx
        .delete(trackerProject)
        .where(
          and(eq(trackerProject.id, data.id), eq(trackerProject.workspaceId, ownerWorkspace.id)),
        )
    })

    return { ok: true }
  })

export const saveTimeEntry = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((input: TimeEntryInput) => input)
  .handler(async ({ data, context }) => {
    const db = createDb()
    const ownerWorkspace = await getOrCreateWorkspace(context.session.user.id)
    const now = new Date()
    const startedAt = parseEntryDateTime(data.date, data.startTime)
    const stoppedAt = parseEntryDateTime(data.date, data.stopTime)
    const durationSeconds = Math.round((stoppedAt.getTime() - startedAt.getTime()) / 1000)

    if (durationSeconds <= 0) {
      throw new Error('Stop time must be after start time')
    }

    if (data.projectId) {
      const project = await db.query.trackerProject.findFirst({
        where: (table, { and, eq }) =>
          and(eq(table.id, data.projectId ?? ''), eq(table.workspaceId, ownerWorkspace.id)),
      })

      if (!project) {
        throw new Error('Project not found')
      }
    }

    const values = {
      projectId: data.projectId || null,
      description: data.description?.trim() || null,
      startedAt,
      stoppedAt,
      durationSeconds,
      billable: data.billable ?? true,
      updatedAt: now,
    }

    if (data.id) {
      await db
        .update(timeEntry)
        .set(values)
        .where(
          and(
            eq(timeEntry.id, data.id),
            eq(timeEntry.workspaceId, ownerWorkspace.id),
            eq(timeEntry.userId, context.session.user.id),
          ),
        )

      return { id: data.id }
    }

    const [createdEntry] = await db
      .insert(timeEntry)
      .values({
        ...values,
        workspaceId: ownerWorkspace.id,
        userId: context.session.user.id,
        source: 'manual',
        createdAt: now,
      })
      .returning({ id: timeEntry.id })

    return { id: createdEntry.id }
  })

export const deleteTimeEntry = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((input: DeleteTimeEntryInput) => input)
  .handler(async ({ data, context }) => {
    const db = createDb()
    const ownerWorkspace = await getOrCreateWorkspace(context.session.user.id)

    await db
      .delete(timeEntry)
      .where(
        and(
          eq(timeEntry.id, data.id),
          eq(timeEntry.workspaceId, ownerWorkspace.id),
          eq(timeEntry.userId, context.session.user.id),
        ),
      )

    return { ok: true }
  })

function getYear(year?: number) {
  if (year && Number.isInteger(year)) {
    return year
  }

  return new Date().getFullYear()
}

function normalizeHourlyRate(value?: string | null) {
  if (!value) {
    return null
  }

  const normalizedValue = value.replace(',', '.').trim()

  if (!normalizedValue) {
    return null
  }

  const parsedValue = Number(normalizedValue)

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    throw new Error('Hourly rate must be a positive number')
  }

  return parsedValue.toFixed(2)
}

function parseEntryDateTime(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error('Invalid entry date or time')
  }

  return new Date(`${date}T${time}:00`)
}
