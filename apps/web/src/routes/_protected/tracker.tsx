import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'

import { pushAlert } from '#/components/alerts'
import { pushSheet } from '#/components/sheets'
import type { TrackerDayEntry } from '#/components/sheets/tracker-day-sheet'
import type { TrackerProjectForm } from '#/components/sheets/tracker-project-sheet'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Icon } from '#/components/ui/icon'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { queries } from '#/queries'

export const Route = createFileRoute('/_protected/tracker')({
  validateSearch: (search): { month?: string } => ({
    month: typeof search.month === 'string' ? search.month : undefined,
  }),
  loaderDeps: ({ search }) => ({
    year: getSelectedMonth(search.month).year,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      queries.tracker.year({
        year: deps.year,
      }),
    ),
  component: TrackerPage,
})

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
})

function TrackerPage() {
  const search = Route.useSearch()
  const selectedMonth = getSelectedMonth(search.month)
  const { data } = useSuspenseQuery(
    queries.tracker.year({
      year: selectedMonth.year,
    }),
  )
  const monthEntries = data.entries.filter((entry) =>
    isEntryInMonth(entry.startedAt, selectedMonth.key),
  )
  const monthSummary = getMonthSummary(data.projects, monthEntries, data.currency)
  const days = getCalendarDays(selectedMonth.key)
  const entriesByDay = new Map<string, typeof monthEntries>()
  const activeProjects = data.projects.filter((project) => !project.archived)
  const projectTotals = getProjectTotals(data.projects, monthEntries)

  for (const entry of monthEntries) {
    const dateKey = toDateKey(new Date(entry.startedAt))
    entriesByDay.set(dateKey, [...(entriesByDay.get(dateKey) ?? []), entry])
  }

  function openDaySheet(date: string, entries: typeof data.entries, selectedEntryId?: string) {
    pushSheet('trackerDay', {
      date,
      year: getYearFromDateKey(date),
      entries: entries.map(getDayEntry),
      selectedEntryId,
      projects: activeProjects.map((project) => ({
        id: project.id,
        name: project.name,
      })),
    })
  }

  function openProjectSheet(project: TrackerProjectForm) {
    pushSheet('trackerProject', {
      year: selectedMonth.year,
      project,
    })
  }

  function openDeleteProjectAlert(project: { id: string; name: string }) {
    pushAlert('confirmDeleteTrackerProject', {
      projectId: project.id,
      projectName: project.name,
      year: selectedMonth.year,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-4xl font-semibold tracking-tight">
              {formatDuration(monthSummary.totalDurationSeconds)}
            </h1>
            <Badge variant="secondary">Month total</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatMoney(monthSummary.billableValue, monthSummary.currency)} billable value in{' '}
            {selectedMonth.label}.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon-sm">
            <Link to="/tracker" search={{ month: selectedMonth.previous }}>
              <Icon name="chevronLeft" aria-hidden />
              <span className="sr-only">Previous month</span>
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="w-36">
            <Link to="/tracker" search={{ month: undefined }}>
              {selectedMonth.label}
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon-sm">
            <Link to="/tracker" search={{ month: selectedMonth.next }}>
              <Icon name="chevronRight" aria-hidden />
              <span className="sr-only">Next month</span>
            </Link>
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle>{selectedMonth.label}</CardTitle>
            <CardDescription>
              Click a day to open its timeline, then drag empty space to create time.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 border-l border-t text-xs text-muted-foreground">
            {weekdays.map((weekday) => (
              <div key={weekday} className="border-r border-b px-3 py-2 font-medium">
                {weekday}
              </div>
            ))}
            {days.map((day) => {
              const entries = entriesByDay.get(day.key) ?? []

              if (entries.length === 0) {
                return (
                  <button
                    key={day.key}
                    className="flex min-h-36 flex-col gap-2 border-r border-b bg-background p-2 text-left transition-colors hover:bg-muted/50 data-[outside=true]:bg-muted/30 data-[today=true]:bg-muted/50"
                    type="button"
                    data-outside={!day.isCurrentMonth}
                    data-today={day.isToday}
                    onClick={() => {
                      openDaySheet(day.key, [])
                    }}
                  >
                    <span
                      className="font-medium text-foreground data-[outside=true]:text-muted-foreground"
                      data-outside={!day.isCurrentMonth}
                    >
                      {day.date.getDate()}
                    </span>
                    <span className="sr-only">Open timeline for {day.key}</span>
                  </button>
                )
              }

              return (
                <div
                  key={day.key}
                  className="flex min-h-36 flex-col gap-2 border-r border-b bg-background p-2 data-[outside=true]:bg-muted/30 data-[today=true]:bg-muted/50"
                  data-outside={!day.isCurrentMonth}
                  data-today={day.isToday}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="font-medium text-foreground data-[outside=true]:text-muted-foreground"
                      data-outside={!day.isCurrentMonth}
                    >
                      {day.date.getDate()}
                    </span>
                    {entries.length > 0 ? (
                      <span className="text-muted-foreground">
                        {formatDuration(
                          entries.reduce((total, entry) => total + entry.durationSeconds, 0),
                        )}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-1">
                    {entries.map((entry) => (
                      <button
                        key={entry.id}
                        className="bg-muted px-2 py-0.5 text-left text-foreground transition-colors hover:bg-muted/80"
                        type="button"
                        onClick={() => {
                          openDaySheet(day.key, entries, entry.id)
                        }}
                      >
                        <span className="block truncate">
                          <span className="font-medium">{entry.projectName}</span>{' '}
                          <span className="text-muted-foreground">
                            ({formatDuration(entry.durationSeconds)})
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-medium">Projects</h2>
          <Button
            size="sm"
            onClick={() => {
              openProjectSheet(getEmptyProjectForm())
            }}
          >
            Create project
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Total time</TableHead>
                  <TableHead>Total amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.projects.length > 0 ? (
                  data.projects.map((project) => {
                    const totals = projectTotals.get(project.id)
                    const projectMonthEntries = monthEntries.filter(
                      (entry) => entry.projectId === project.id,
                    )

                    return (
                      <TableRow key={project.id}>
                        <TableCell className="font-medium">{project.name}</TableCell>
                        <TableCell>{formatDuration(totals?.durationSeconds ?? 0)}</TableCell>
                        <TableCell>
                          {formatMoney(totals?.billableValue ?? 0, project.currency)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={project.archived ? 'outline' : 'secondary'}>
                            {project.archived ? 'Archived' : 'In progress'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={projectMonthEntries.length === 0}
                              onClick={() => {
                                exportProjectCsv(project, projectMonthEntries, selectedMonth.key)
                              }}
                            >
                              Export
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                openProjectSheet(getProjectForm(project))
                              }}
                            >
                              Edit
                            </Button>
                            {project.archived ? (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  openDeleteProjectAlert(project)
                                }}
                              >
                                Delete
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Create your first project to start grouping time entries.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function getCalendarDays(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0)
  const days: Array<{
    key: string
    date: Date
    isCurrentMonth: boolean
    isToday: boolean
  }> = []
  const start = new Date(monthStart)
  const mondayOffset = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - mondayOffset)
  const end = new Date(monthEnd)
  const sundayOffset = 6 - ((end.getDay() + 6) % 7)
  end.setDate(end.getDate() + sundayOffset)

  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const day = new Date(date)
    days.push({
      key: toDateKey(day),
      date: day,
      isCurrentMonth: day.getMonth() === monthStart.getMonth(),
      isToday: toDateKey(day) === toDateKey(new Date()),
    })
  }

  return days
}

function getSelectedMonth(month?: string) {
  const selectedMonthStart = getMonthStart(month)

  return {
    key: toMonthKey(selectedMonthStart),
    label: monthFormatter.format(selectedMonthStart),
    previous: toMonthKey(
      new Date(selectedMonthStart.getFullYear(), selectedMonthStart.getMonth() - 1, 1),
    ),
    next: toMonthKey(
      new Date(selectedMonthStart.getFullYear(), selectedMonthStart.getMonth() + 1, 1),
    ),
    year: selectedMonthStart.getFullYear(),
  }
}

function getMonthStart(month?: string) {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, monthIndex] = month.split('-').map(Number)

    if (monthIndex >= 1 && monthIndex <= 12) {
      return new Date(year, monthIndex - 1, 1)
    }
  }

  const now = new Date()

  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function toMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function isEntryInMonth(startedAt: string, monthKey: string) {
  return startedAt.slice(0, 7) === monthKey
}

function getYearFromDateKey(dateKey: string) {
  const [year] = dateKey.split('-').map(Number)

  if (Number.isInteger(year)) {
    return year
  }

  return new Date().getFullYear()
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  return `${hours}h ${minutes}m`
}

function formatCsvDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (minutes === 0) {
    return `${hours}h`
  }

  if (hours === 0) {
    return `${minutes}m`
  }

  return `${hours}h ${minutes}m`
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function toTimeValue(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatCsvDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(date)
}

function getEmptyProjectForm() {
  return {
    id: undefined as string | undefined,
    name: '',
    hourlyRate: '',
    currency: 'SEK',
    billable: true,
    archived: false,
  }
}

function getProjectForm(project: {
  id: string
  name: string
  hourlyRate: string | null
  currency: string
  billable: boolean
  archived: boolean
}): TrackerProjectForm {
  return {
    id: project.id,
    name: project.name,
    hourlyRate: project.hourlyRate ?? '',
    currency: project.currency,
    billable: project.billable,
    archived: project.archived,
  }
}

function getProjectTotals(
  projects: Array<{
    id: string
    hourlyRate: string | null
  }>,
  entries: Array<{
    projectId: string | null
    durationSeconds: number
    billable: boolean
  }>,
) {
  const projectTotals = new Map<string, { durationSeconds: number; billableValue: number }>()
  const hourlyRateByProjectId = new Map(
    projects.map((project) => [project.id, Number(project.hourlyRate ?? 0)]),
  )

  for (const entry of entries) {
    if (!entry.projectId) {
      continue
    }

    const currentTotal = projectTotals.get(entry.projectId) ?? {
      durationSeconds: 0,
      billableValue: 0,
    }
    const hourlyRate = hourlyRateByProjectId.get(entry.projectId) ?? 0

    projectTotals.set(entry.projectId, {
      durationSeconds: currentTotal.durationSeconds + entry.durationSeconds,
      billableValue:
        currentTotal.billableValue +
        (entry.billable ? (entry.durationSeconds / 3600) * hourlyRate : 0),
    })
  }

  return projectTotals
}

function exportProjectCsv(
  project: {
    name: string
  },
  entries: Array<{
    description: string | null
    startedAt: string
    durationSeconds: number
  }>,
  monthKey: string,
) {
  const totalDurationSeconds = entries.reduce((total, entry) => total + entry.durationSeconds, 0)
  const rows = [
    ['Date', 'Description', 'Time'],
    ...entries.map((entry) => [
      formatCsvDate(new Date(entry.startedAt)),
      entry.description || project.name,
      formatCsvDuration(entry.durationSeconds),
    ]),
    ['Total Time', '', formatCsvDuration(totalDurationSeconds)],
  ]
  const csv = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `${slugify(project.name)}-${monthKey}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function escapeCsvValue(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }

  return value
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function getMonthSummary(
  projects: Array<{
    id: string
    hourlyRate: string | null
  }>,
  entries: Array<{
    projectId: string | null
    durationSeconds: number
    billable: boolean
  }>,
  currency: string,
) {
  const projectTotals = getProjectTotals(projects, entries)
  const totalDurationSeconds = entries.reduce((total, entry) => total + entry.durationSeconds, 0)
  const billableValue = Array.from(projectTotals.values()).reduce(
    (total, projectTotal) => total + projectTotal.billableValue,
    0,
  )

  return {
    totalDurationSeconds,
    billableValue,
    currency,
  }
}

function getDayEntry(entry: {
  id: string
  projectId: string | null
  description: string | null
  startedAt: string
  stoppedAt: string | null
  billable: boolean
}): TrackerDayEntry {
  const startedAt = new Date(entry.startedAt)
  const stoppedAt = entry.stoppedAt ? new Date(entry.stoppedAt) : new Date(startedAt)

  return {
    id: entry.id,
    projectId: entry.projectId ?? '',
    description: entry.description ?? '',
    date: toDateKey(startedAt),
    startTime: toTimeValue(startedAt),
    stopTime: toTimeValue(stoppedAt),
    billable: entry.billable,
  }
}
