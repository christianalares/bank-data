import {
  type ColumnSizingState,
  flexRender,
  type RowData,
  type Table as TanstackTable,
} from '@tanstack/react-table'
import { useLayoutEffect, useMemo, useRef } from 'react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { cn } from '#/lib/utils'

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string
    headerClassName?: string
  }
}

type Props<T> = {
  table: TanstackTable<T>
  onRowClick?: (row: T) => void
  className?: string
}

export function DataTable<T>({ table, onRowClick, className }: Props<T>) {
  const tableRef = useRef<HTMLTableElement>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs once on mount to distribute columns equally; column structure is static
  useLayoutEffect(() => {
    if (!tableRef.current || Object.keys(table.getState().columnSizing).length > 0) {
      return
    }

    const containerWidth = tableRef.current.offsetWidth
    const allCols = table.getAllLeafColumns()

    const fixedWidth = allCols
      .filter((col) => !col.getCanResize())
      .reduce((sum, col) => sum + col.getSize(), 0)

    const resizableCols = allCols.filter((col) => col.getCanResize())
    const equalWidth = Math.floor((containerWidth - fixedWidth) / resizableCols.length)

    const sizing: ColumnSizingState = {}
    for (const col of resizableCols) {
      sizing[col.id] = equalWidth
    }

    table.setColumnSizing(sizing)
  }, [])

  const { columnSizing, columnSizingInfo } = table.getState()

  // biome-ignore lint/correctness/useExhaustiveDependencies: columnSizing/columnSizingInfo are the reactive values; table.getFlatHeaders is stable
  const columnSizeVars = useMemo(() => {
    const vars: Record<string, number> = {}
    for (const header of table.getFlatHeaders()) {
      vars[`--header-${header.id}-size`] = header.getSize()
      vars[`--col-${header.column.id}-size`] = header.column.getSize()
    }
    return vars
  }, [columnSizing, columnSizingInfo])

  return (
    <Table ref={tableRef} className={cn('table-fixed', className)} style={columnSizeVars}>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header, index) => {
              const isLast = index === headerGroup.headers.length - 1
              return (
                <TableHead
                  key={header.id}
                  className={cn('relative', header.column.columnDef.meta?.headerClassName)}
                  style={
                    isLast ? undefined : { width: `calc(var(--header-${header.id}-size) * 1px)` }
                  }
                >
                  {header.isPlaceholder ? null : (
                    <span className="block truncate">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </span>
                  )}
                  {header.column.getCanResize() && (
                    <button
                      type="button"
                      aria-label="Resize column"
                      tabIndex={-1}
                      onDoubleClick={() => header.column.resetSize()}
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className="group/resizer absolute inset-y-0 right-0 z-10 w-4 translate-x-1/2 cursor-col-resize select-none touch-none"
                    >
                      <div
                        className={cn(
                          'mx-auto h-full w-px transition-opacity',
                          header.column.getIsResizing()
                            ? 'bg-primary opacity-100'
                            : 'bg-border opacity-0 group-hover/resizer:opacity-100',
                        )}
                      />
                    </button>
                  )}
                </TableHead>
              )
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            data-state={row.getIsSelected() ? 'selected' : undefined}
            className={cn({ 'cursor-pointer': !!onRowClick })}
            onClick={() => onRowClick?.(row.original)}
          >
            {row.getVisibleCells().map((cell, index) => {
              const isLast = index === row.getVisibleCells().length - 1
              return (
                <TableCell
                  key={cell.id}
                  className={cn(
                    'overflow-hidden text-ellipsis',
                    cell.column.columnDef.meta?.className,
                  )}
                  style={
                    isLast ? undefined : { width: `calc(var(--col-${cell.column.id}-size) * 1px)` }
                  }
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              )
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
