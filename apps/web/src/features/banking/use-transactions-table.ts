import { useDebouncedCallback } from '@tanstack/react-pacer'
import type { ColumnSizingState } from '@tanstack/react-table'
import {
  type FilterFn,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { saveTransactionColumnSizing } from '#/features/banking/column-sizing'

import { type TransactionRow, transactionColumns } from './transaction-columns'

type RowSelection = Record<string, boolean>

const EMPTY_ROW_SELECTION: RowSelection = {}

const searchTransaction: FilterFn<TransactionRow> = (row, _columnId, filterValue: string) => {
  const needle = filterValue.trim().toLowerCase()

  if (needle.length === 0) {
    return true
  }

  const { description, merchantName, counterpartyName, accountName, amount, note } = row.original
  const haystack = [description, merchantName, counterpartyName, accountName, amount, note]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()

  return haystack.includes(needle)
}

function isSameMonth(isoDate: string, month: Date) {
  const date = new Date(isoDate)
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth()
}

type Props = {
  transactions: TransactionRow[]
  initialColumnSizing?: ColumnSizingState
}

export function useTransactionsTable({ transactions, initialColumnSizing = {} }: Props) {
  const [rowSelection, setRowSelection] = useState<RowSelection>(EMPTY_ROW_SELECTION)
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(initialColumnSizing)
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState<Date | null>(null)

  const data = useMemo(() => {
    if (!month) {
      return transactions
    }

    return transactions.filter((transaction) => isSameMonth(transaction.bookedAt, month))
  }, [transactions, month])

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
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: searchTransaction,
    state: {
      rowSelection,
      columnSizing,
      globalFilter: search,
    },
    onRowSelectionChange: setRowSelection,
    onColumnSizingChange: handleColumnSizingChange,
    onGlobalFilterChange: setSearch,
    enableRowSelection: true,
    getRowId: (row) => row.id,
  })

  return { table, search, setSearch, month, setMonth }
}
