import { useDebouncedCallback } from '@tanstack/react-pacer'
import type { ColumnSizingState } from '@tanstack/react-table'
import { getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { saveTransactionColumnSizing } from '#/features/banking/column-sizing'

import { type TransactionRow, transactionColumns } from './transaction-columns'

type RowSelection = Record<string, boolean>

const EMPTY_ROW_SELECTION: RowSelection = {}

type Props = {
  transactions: TransactionRow[]
  initialColumnSizing?: ColumnSizingState
}

export function useTransactionsTable({ transactions, initialColumnSizing = {} }: Props) {
  const [rowSelection, setRowSelection] = useState<RowSelection>(EMPTY_ROW_SELECTION)
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(initialColumnSizing)

  const data = useMemo(() => transactions, [transactions])

  const debouncedSave = useDebouncedCallback(saveTransactionColumnSizing, { wait: 300 })

  const handleColumnSizingChange = useCallback(
    (updater: ColumnSizingState | ((prev: ColumnSizingState) => ColumnSizingState)) => {
      setColumnSizing((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        debouncedSave(next)
        return next
      })
    },
    [debouncedSave],
  )

  const table = useReactTable({
    data,
    columns: transactionColumns,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    state: {
      rowSelection,
      columnSizing,
    },
    onRowSelectionChange: setRowSelection,
    onColumnSizingChange: handleColumnSizingChange,
    enableRowSelection: true,
    getRowId: (row) => row.id,
  })

  return table
}
