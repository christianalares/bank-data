import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { pushAlert } from '#/components/alerts'
import { DayTimeline } from '#/components/tracker/day-timeline'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { Textarea } from '#/components/ui/textarea'
import { mutations } from '#/mutations'
import { queries } from '#/queries'

export type TrackerTimeEntryForm = {
  id?: string
  projectId: string
  description: string
  date: string
  startTime: string
  stopTime: string
  billable: boolean
}

export type TrackerDayEntry = TrackerTimeEntryForm & {
  id: string
}

type ProjectOption = {
  id: string
  name: string
}

type Props = {
  date: string
  year: number
  entries: TrackerDayEntry[]
  selectedEntryId?: string
  projects: ProjectOption[]
}

type LocalEntryForm = TrackerTimeEntryForm & {
  localId: string
}

type PersistEntryOptions = {
  onSuccess?: (savedEntry: LocalEntryForm) => void
}

export function TrackerDaySheet({ date, year, entries, selectedEntryId, projects }: Props) {
  const initialEntries =
    entries.length > 0 ? entries.map((entry) => ({ ...entry, localId: entry.id })) : []
  const [dayEntries, setDayEntries] = useState<LocalEntryForm[]>(initialEntries)
  const [selectedLocalId, setSelectedLocalId] = useState(
    selectedEntryId ?? initialEntries[0]?.localId,
  )
  const [error, setError] = useState<string | null>(null)
  const entryForm = dayEntries.find((entry) => entry.localId === selectedLocalId) ?? dayEntries[0]
  const saveTimeEntryMutation = useMutation({
    ...mutations.tracker.saveTimeEntry(),
    onSuccess: async (_result, _variables, _onMutateResult, context) => {
      await context.client.invalidateQueries(queries.tracker.year({ year }))
    },
  })

  function persistEntry(targetEntry: LocalEntryForm, options?: PersistEntryOptions) {
    setError(null)

    saveTimeEntryMutation.mutate(targetEntry, {
      onSuccess: (result) => {
        const savedEntry = {
          ...targetEntry,
          id: result.id,
          localId: result.id,
        }

        setDayEntries((currentEntries) => {
          let didUpdate = false
          const nextEntries = currentEntries.map((entry) => {
            if (entry.localId !== targetEntry.localId) {
              return entry
            }

            didUpdate = true
            return savedEntry
          })

          if (didUpdate) {
            return nextEntries
          }

          return [...nextEntries, savedEntry]
        })
        setSelectedLocalId(result.id)
        options?.onSuccess?.(savedEntry)
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : 'Could not update entry'
        setError(message)
        toast.error(message)
      },
    })
  }

  function handleDeleteEntry(targetEntry: LocalEntryForm) {
    if (!targetEntry.id) {
      removeLocalEntry(targetEntry.localId)
      return
    }

    setError(null)
    pushAlert('confirmDeleteTimeEntry', {
      entryId: targetEntry.id,
      year,
      onDeleted: () => {
        removeLocalEntry(targetEntry.localId)
      },
    })
  }

  function createEntry(time?: { startTime: string; stopTime: string }) {
    const nextEntry = {
      ...createEmptyEntry(date),
      ...time,
    }
    setDayEntries((currentEntries) => [...currentEntries, nextEntry])
    setSelectedLocalId(nextEntry.localId)
    setError(null)

    persistEntry(nextEntry, {
      onSuccess: () => {
        toast.success('Entry created')
      },
    })
  }

  function handleFieldCommit(values: Partial<TrackerTimeEntryForm>) {
    if (!entryForm) {
      return
    }

    const nextEntry = updateSelectedEntry(values)
    persistEntry(nextEntry)
  }

  function removeLocalEntry(localId: string) {
    setDayEntries((currentEntries) => {
      const nextEntries = currentEntries.filter((entry) => entry.localId !== localId)

      setSelectedLocalId(nextEntries[0]?.localId)
      return nextEntries
    })
  }

  function updateSelectedEntry(values: Partial<TrackerTimeEntryForm>) {
    if (!entryForm) {
      return createEmptyEntry(date)
    }

    const nextEntry = {
      ...entryForm,
      ...values,
    }

    setDayEntries((currentEntries) =>
      currentEntries.map((entry) => {
        if (entry.localId !== entryForm.localId) {
          return entry
        }

        return nextEntry
      }),
    )

    return nextEntry
  }

  return (
    <SheetContent className="sm:max-w-md">
      <div className="flex min-h-0 flex-1 flex-col">
        <SheetHeader>
          <SheetTitle>{formatDateLabel(date)}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <FieldGroup>
            <DayTimeline
              entries={dayEntries.map((entry) => {
                const project = projects.find(
                  (projectOption) => projectOption.id === entry.projectId,
                )

                return {
                  id: entry.localId,
                  title: project?.name,
                  description: entry.description || undefined,
                  startTime: entry.startTime,
                  stopTime: entry.stopTime,
                }
              })}
              selectedEntryId={entryForm?.localId}
              onEntrySelect={(entryId) => {
                setSelectedLocalId(entryId)
              }}
              onTimeChange={(time) => {
                updateSelectedEntry(time)
              }}
              onTimeCommit={(time) => {
                handleFieldCommit(time)
              }}
              onEntryCreate={(time) => {
                createEntry(time)
              }}
              onEntryDelete={(entryId) => {
                const entry = dayEntries.find((dayEntry) => dayEntry.localId === entryId)

                if (!entry) {
                  return
                }

                handleDeleteEntry(entry)
              }}
            />
            {entryForm ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="entry-start">Start</FieldLabel>
                    <Input
                      id="entry-start"
                      type="time"
                      value={entryForm.startTime}
                      readOnly
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="entry-stop">Stop</FieldLabel>
                    <Input
                      id="entry-stop"
                      type="time"
                      value={entryForm.stopTime}
                      readOnly
                      required
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel>Project</FieldLabel>
                  <Select
                    value={entryForm.projectId || 'none'}
                    onValueChange={(value) => {
                      handleFieldCommit({ projectId: value === 'none' ? '' : value })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="none">No project</SelectItem>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="entry-description">Description</FieldLabel>
                  <Textarea
                    id="entry-description"
                    value={entryForm.description}
                    onChange={(event) => {
                      updateSelectedEntry({ description: event.target.value })
                    }}
                    onBlur={(event) => {
                      handleFieldCommit({ description: event.target.value })
                    }}
                  />
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    id="entry-billable"
                    checked={entryForm.billable}
                    onCheckedChange={(checked) => {
                      handleFieldCommit({ billable: checked === true })
                    }}
                  />
                  <FieldLabel htmlFor="entry-billable">Billable</FieldLabel>
                </Field>
              </>
            ) : (
              <Field>
                <p className="text-sm text-muted-foreground">
                  Drag in the timeline to create a time entry.
                </p>
              </Field>
            )}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </FieldGroup>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </SheetClose>
        </SheetFooter>
      </div>
    </SheetContent>
  )
}

function createEmptyEntry(date: string): LocalEntryForm {
  return {
    localId: crypto.randomUUID(),
    id: undefined,
    projectId: '',
    description: '',
    date,
    startTime: '09:00',
    stopTime: '10:00',
    billable: true,
  }
}

function formatDateLabel(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`)

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(parsedDate)
}
