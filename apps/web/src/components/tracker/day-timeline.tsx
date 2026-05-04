import { type PointerEvent, useRef, useState } from 'react'

import { Icon } from '#/components/ui/icon'
import { cn } from '#/lib/utils'

type TimelineEntry = {
  id: string
  title?: string
  description?: string
  startTime: string
  stopTime: string
}

type Props = {
  entries: TimelineEntry[]
  selectedEntryId?: string
  onEntrySelect: (entryId: string) => void
  onTimeChange: (time: { startTime: string; stopTime: string }) => void
  onTimeCommit: (time: { startTime: string; stopTime: string }) => void
  onEntryDelete: (entryId: string) => void
  onEntryCreate: (time: { startTime: string; stopTime: string }) => void
}

type DragMode = 'start' | 'stop' | 'move'
type InteractionMode = DragMode | 'delete'

type DragState = {
  mode: DragMode
  pointerStartY: number
  startMinutes: number
  stopMinutes: number
  latestTime: {
    startTime: string
    stopTime: string
  }
}

type CreateDragState = {
  pointerStartMinutes: number
  latestTime: {
    startTime: string
    stopTime: string
  }
}

const hours = Array.from({ length: 24 }, (_, hour) => hour)
const hourHeight = 30
const timelineHeight = hours.length * hourHeight
const minutesPerPixel = 60 / hourHeight
const snapMinutes = 15
const minimumDurationMinutes = 15
const latestStopMinutes = 24 * 60 - snapMinutes
const latestStartMinutes = latestStopMinutes - minimumDurationMinutes
const resizeZoneHeight = 8
const deleteZoneSize = 28

export function DayTimeline({
  entries,
  selectedEntryId,
  onEntrySelect,
  onTimeChange,
  onTimeCommit,
  onEntryDelete,
  onEntryCreate,
}: Props) {
  const dragStateRef = useRef<DragState | null>(null)
  const createDragStateRef = useRef<CreateDragState | null>(null)
  const [createPreview, setCreatePreview] = useState<{
    startTime: string
    stopTime: string
  } | null>(null)
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? entries[0]
  const positionedEntries = getPositionedEntries(entries)
  const durationMinutes = selectedEntry
    ? getDurationMinutes(selectedEntry.startTime, selectedEntry.stopTime)
    : 0
  const entryStartMinutes = selectedEntry ? getMinutesFromTime(selectedEntry.startTime) : 0
  const entryStopMinutes = selectedEntry
    ? getMinutesFromTime(selectedEntry.stopTime)
    : minimumDurationMinutes

  function startDrag(mode: DragMode, event: PointerEvent<HTMLElement>) {
    if (!selectedEntry) {
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.style.cursor = getCursorForMode(mode)
    dragStateRef.current = {
      mode,
      pointerStartY: event.clientY,
      startMinutes: entryStartMinutes,
      stopMinutes: entryStopMinutes,
      latestTime: {
        startTime: selectedEntry.startTime,
        stopTime: selectedEntry.stopTime,
      },
    }
  }

  function updateDrag(event: PointerEvent<HTMLElement>) {
    const dragState = dragStateRef.current

    if (!dragState) {
      return
    }

    const minuteDelta = snapToMinutes((event.clientY - dragState.pointerStartY) * minutesPerPixel)

    if (dragState.mode === 'start') {
      const nextStartMinutes = clampMinutes(
        dragState.startMinutes + minuteDelta,
        0,
        dragState.stopMinutes - minimumDurationMinutes,
      )
      updateTime(nextStartMinutes, dragState.stopMinutes)
      return
    }

    if (dragState.mode === 'stop') {
      const nextStopMinutes = clampMinutes(
        dragState.stopMinutes + minuteDelta,
        dragState.startMinutes + minimumDurationMinutes,
        latestStopMinutes,
      )
      updateTime(dragState.startMinutes, nextStopMinutes)
      return
    }

    const duration = dragState.stopMinutes - dragState.startMinutes
    const nextStartMinutes = clampMinutes(
      dragState.startMinutes + minuteDelta,
      0,
      latestStopMinutes - duration,
    )
    updateTime(nextStartMinutes, nextStartMinutes + duration)
  }

  function stopDrag(event: PointerEvent<HTMLElement>) {
    const latestTime = dragStateRef.current?.latestTime

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    dragStateRef.current = null
    updateEntryCursor(event)

    if (latestTime) {
      onTimeCommit(latestTime)
    }
  }

  function updateTime(startMinutes: number, stopMinutes: number) {
    const nextTime = {
      startTime: formatTime(startMinutes),
      stopTime: formatTime(stopMinutes),
    }

    if (dragStateRef.current) {
      dragStateRef.current.latestTime = nextTime
    }

    onTimeChange(nextTime)
  }

  function updateEntryCursor(event: PointerEvent<HTMLElement>) {
    const dragState = dragStateRef.current

    if (dragState) {
      event.currentTarget.style.cursor = getCursorForMode(dragState.mode)
      return
    }

    event.currentTarget.style.cursor = getCursorForMode(getInteractionMode(event))
  }

  function startCreateDrag(event: PointerEvent<HTMLElement>) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.style.cursor = 'ns-resize'

    const startMinutes = clampMinutes(getTimelineMinutes(event), 0, latestStartMinutes)
    const stopMinutes = clampMinutes(
      startMinutes + minimumDurationMinutes,
      startMinutes + minimumDurationMinutes,
      latestStopMinutes,
    )
    const nextTime = {
      startTime: formatTime(startMinutes),
      stopTime: formatTime(stopMinutes),
    }

    createDragStateRef.current = {
      pointerStartMinutes: startMinutes,
      latestTime: nextTime,
    }
    setCreatePreview(nextTime)
  }

  function updateCreateDrag(event: PointerEvent<HTMLElement>) {
    const createDragState = createDragStateRef.current

    if (!createDragState) {
      return
    }

    const currentMinutes = getTimelineMinutes(event)
    const startMinutes = Math.min(createDragState.pointerStartMinutes, currentMinutes)
    const stopMinutes = Math.max(createDragState.pointerStartMinutes, currentMinutes)
    const nextStartMinutes = clampMinutes(startMinutes, 0, latestStartMinutes)
    const nextStopMinutes = clampMinutes(
      stopMinutes,
      nextStartMinutes + minimumDurationMinutes,
      latestStopMinutes,
    )
    const nextTime = {
      startTime: formatTime(nextStartMinutes),
      stopTime: formatTime(nextStopMinutes),
    }

    createDragState.latestTime = nextTime
    setCreatePreview(nextTime)
  }

  function stopCreateDrag(event: PointerEvent<HTMLElement>) {
    const latestTime = createDragStateRef.current?.latestTime

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    event.currentTarget.style.cursor = ''
    createDragStateRef.current = null
    setCreatePreview(null)

    if (latestTime) {
      onEntryCreate(latestTime)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-heading text-2xl font-semibold">{formatDuration(durationMinutes)}</p>
      </div>

      <div className="grid grid-cols-[3rem_1fr] gap-3 text-xs text-muted-foreground">
        <div className="relative" style={{ height: timelineHeight }}>
          {hours.map((hour) => (
            <div
              key={hour}
              className="absolute left-0"
              style={{
                top: hour * hourHeight,
              }}
            >
              {String(hour).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        <div
          className="relative cursor-crosshair border"
          style={{ height: timelineHeight }}
          onPointerDown={startCreateDrag}
          onPointerMove={updateCreateDrag}
          onPointerUp={stopCreateDrag}
          onPointerCancel={stopCreateDrag}
        >
          {hours.map((hour) => (
            <div
              key={hour}
              className="pointer-events-none absolute inset-x-0 border-t"
              style={{
                top: hour * hourHeight,
              }}
            />
          ))}
          {createPreview ? (
            <div
              className="pointer-events-none absolute left-2 right-2 bg-muted/60 p-3 text-left text-foreground ring-1 ring-foreground/20"
              style={{
                top: (getMinutesFromTime(createPreview.startTime) / 60) * hourHeight,
                height: Math.max(
                  (getDurationMinutes(createPreview.startTime, createPreview.stopTime) / 60) *
                    hourHeight,
                  24,
                ),
              }}
            >
              <p className="truncate font-medium">
                {createPreview.startTime} - {createPreview.stopTime}
              </p>
            </div>
          ) : null}
          {positionedEntries.map(({ column, columnCount, entry }) => {
            const isSelected = entry.id === selectedEntry?.id
            const top = (getMinutesFromTime(entry.startTime) / 60) * hourHeight
            const height = Math.max(
              (getDurationMinutes(entry.startTime, entry.stopTime) / 60) * hourHeight,
              24,
            )
            const gap = 4
            const horizontalPadding = 8
            const width = `calc((100% - ${horizontalPadding * 2}px - ${
              (columnCount - 1) * gap
            }px) / ${columnCount})`
            const left = `calc(${horizontalPadding}px + ${column} * ((100% - ${
              horizontalPadding * 2
            }px - ${(columnCount - 1) * gap}px) / ${columnCount} + ${gap}px))`

            return (
              <button
                key={entry.id}
                className={cn(
                  'absolute touch-none bg-muted p-3 text-left text-foreground',
                  isSelected
                    ? 'cursor-grab ring-1 ring-foreground/20 active:cursor-grabbing'
                    : 'cursor-pointer opacity-70',
                )}
                type="button"
                style={{
                  top,
                  height,
                  left,
                  width,
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Backspace' || event.key === 'Delete') {
                    event.preventDefault()
                    onEntryDelete(entry.id)
                    return
                  }

                  if (event.key !== 'Enter' && event.key !== ' ') {
                    return
                  }

                  event.preventDefault()
                  onEntrySelect(entry.id)
                }}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  onEntrySelect(entry.id)

                  if (isSelected) {
                    const interactionMode = getInteractionMode(event)

                    if (interactionMode === 'delete') {
                      event.preventDefault()
                      onEntryDelete(entry.id)
                      return
                    }

                    startDrag(interactionMode, event)
                  }
                }}
                onPointerMove={
                  isSelected
                    ? (event) => {
                        event.stopPropagation()
                        updateEntryCursor(event)
                        updateDrag(event)
                      }
                    : undefined
                }
                onPointerUp={
                  isSelected
                    ? (event) => {
                        event.stopPropagation()
                        stopDrag(event)
                      }
                    : undefined
                }
                onPointerCancel={
                  isSelected
                    ? (event) => {
                        event.stopPropagation()
                        stopDrag(event)
                      }
                    : undefined
                }
                onPointerLeave={
                  isSelected
                    ? (event) => {
                        if (!dragStateRef.current) {
                          event.currentTarget.style.cursor = ''
                        }
                      }
                    : undefined
                }
              >
                {isSelected ? (
                  <span
                    className="absolute right-1 top-1 inline-flex size-6 items-center justify-center text-muted-foreground transition-colors hover:text-destructive"
                    aria-hidden="true"
                  >
                    <Icon name="trash" className="size-4" aria-hidden />
                  </span>
                ) : null}
                <p
                  className={cn(
                    'truncate font-medium',
                    !entry.title && !entry.description && 'text-muted-foreground',
                    isSelected && 'pr-6',
                  )}
                >
                  {entry.title || `${entry.startTime} - ${entry.stopTime}`}
                </p>
                {entry.description ? (
                  <p className="truncate text-muted-foreground">{entry.description}</p>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function getDurationMinutes(startTime: string, stopTime: string) {
  const startMinutes = getMinutesFromTime(startTime)
  const stopMinutes = getMinutesFromTime(stopTime)

  return Math.max(stopMinutes - startMinutes, 0)
}

function getTimelineMinutes(event: PointerEvent<HTMLElement>) {
  const bounds = event.currentTarget.getBoundingClientRect()
  const y = clampMinutes(event.clientY - bounds.top, 0, timelineHeight)

  return snapToMinutes(y * minutesPerPixel)
}

function getInteractionMode(event: PointerEvent<HTMLElement>): InteractionMode {
  const bounds = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - bounds.left
  const y = event.clientY - bounds.top

  if (x >= bounds.width - deleteZoneSize && y <= deleteZoneSize) {
    return 'delete'
  }

  if (y <= resizeZoneHeight) {
    return 'start'
  }

  if (bounds.height - y <= resizeZoneHeight) {
    return 'stop'
  }

  return 'move'
}

function getCursorForMode(mode: InteractionMode) {
  if (mode === 'delete') {
    return 'pointer'
  }

  if (mode === 'start' || mode === 'stop') {
    return 'ns-resize'
  }

  return 'grab'
}

function getMinutesFromTime(time: string) {
  const [hoursValue, minutesValue] = time.split(':').map(Number)

  if (!Number.isFinite(hoursValue) || !Number.isFinite(minutesValue)) {
    return 0
  }

  return hoursValue * 60 + minutesValue
}

function getPositionedEntries(entries: TimelineEntry[]) {
  const sortedEntries = entries
    .map((entry) => ({
      entry,
      startMinutes: getMinutesFromTime(entry.startTime),
      stopMinutes: getMinutesFromTime(entry.stopTime),
    }))
    .sort((firstEntry, secondEntry) => {
      if (firstEntry.startMinutes !== secondEntry.startMinutes) {
        return firstEntry.startMinutes - secondEntry.startMinutes
      }

      return secondEntry.stopMinutes - firstEntry.stopMinutes
    })

  const groups: Array<typeof sortedEntries> = []
  let currentGroup: typeof sortedEntries = []
  let currentGroupEnd = 0

  for (const entry of sortedEntries) {
    if (currentGroup.length === 0 || entry.startMinutes < currentGroupEnd) {
      currentGroup.push(entry)
      currentGroupEnd = Math.max(currentGroupEnd, entry.stopMinutes)
      continue
    }

    groups.push(currentGroup)
    currentGroup = [entry]
    currentGroupEnd = entry.stopMinutes
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }

  return groups.flatMap((group) => {
    const columnEnds: number[] = []

    const positionedGroup = group.map((entry) => {
      const column = columnEnds.findIndex((columnEnd) => columnEnd <= entry.startMinutes)
      const nextColumn = column === -1 ? columnEnds.length : column
      columnEnds[nextColumn] = entry.stopMinutes

      return {
        entry: entry.entry,
        column: nextColumn,
        columnCount: 1,
      }
    })

    return positionedGroup.map((entry) => ({
      ...entry,
      columnCount: columnEnds.length,
    }))
  })
}

function snapToMinutes(minutes: number) {
  return Math.round(minutes / snapMinutes) * snapMinutes
}

function clampMinutes(minutes: number, min: number, max: number) {
  return Math.min(Math.max(minutes, min), max)
}

function formatTime(minutes: number) {
  const clampedMinutes = clampMinutes(minutes, 0, latestStopMinutes)
  const hoursValue = Math.floor(clampedMinutes / 60)
  const minutesValue = clampedMinutes % 60

  return `${String(hoursValue).padStart(2, '0')}:${String(minutesValue).padStart(2, '0')}`
}

function formatDuration(minutes: number) {
  const hoursValue = Math.floor(minutes / 60)
  const minutesValue = minutes % 60

  return `${hoursValue}h ${minutesValue}m`
}
