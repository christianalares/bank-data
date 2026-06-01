import type { ColumnDef } from '@tanstack/react-table'

import { Badge } from '#/components/ui/badge'
import { Checkbox } from '#/components/ui/checkbox'

export type TransactionRow = {
  id: string
  accountName: string
  bookedAt: string
  amount: string
  currency: string
  description: string
  merchantName: string | null
  counterpartyName: string | null
  balanceAfterTransaction: string | null
  status: 'booked' | 'pending'
  provider: string
  note: string | null
  attachmentCount: number
  suggestedAttachmentCount: number
}

const dateFormatter = new Intl.DateTimeFormat('en-SE', { dateStyle: 'medium' })

function formatMoney(amount: string, currency: string) {
  return new Intl.NumberFormat('en-SE', {
    style: 'currency',
    currency,
  }).format(Number(amount))
}

export const transactionColumns: ColumnDef<TransactionRow>[] = [
  {
    id: 'select',
    size: 40,
    enableResizing: false,
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() ? 'indeterminate' : false)
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      </div>
    ),
    cell: ({ row }) => (
      // biome-ignore lint/a11y/noStaticElementInteractions: .
      <div
        className="flex items-center justify-center"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.stopPropagation()
          }
        }}
      >
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      </div>
    ),
    meta: {
      className: 'w-10 !p-0',
      headerClassName: 'w-10 !px-0',
    },
  },
  {
    id: 'bookedAt',
    minSize: 80,
    header: 'Date',
    accessorFn: (row) => row.bookedAt,
    cell: ({ row }) => dateFormatter.format(new Date(row.original.bookedAt)),
    meta: { className: 'whitespace-nowrap' },
  },
  {
    id: 'description',
    minSize: 120,
    header: 'Description',
    accessorFn: (row) => row.description,
    cell: ({ row }) => {
      const subtitle = row.original.merchantName ?? row.original.counterpartyName

      return (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.description}</span>
          {subtitle ? <span className="text-muted-foreground">{subtitle}</span> : null}
        </div>
      )
    },
  },
  {
    id: 'amount',
    minSize: 80,
    header: 'Amount',
    accessorFn: (row) => row.amount,
    cell: ({ row }) => (
      <span
        className={Number(row.original.amount) > 0 ? 'text-green-600 font-medium' : 'font-medium'}
      >
        {formatMoney(row.original.amount, row.original.currency)}
      </span>
    ),
    meta: { className: 'text-right whitespace-nowrap', headerClassName: 'text-right' },
  },
  {
    id: 'balanceAfterTransaction',
    minSize: 80,
    header: 'Balance after',
    accessorFn: (row) => row.balanceAfterTransaction,
    cell: ({ row }) => {
      const value = row.original.balanceAfterTransaction

      if (value === null) {
        return <span className="text-muted-foreground">—</span>
      }

      return formatMoney(value, row.original.currency)
    },
    meta: { className: 'text-right whitespace-nowrap', headerClassName: 'text-right' },
  },
  {
    id: 'attachmentStatus',
    minSize: 80,
    enableResizing: false,
    header: 'Status',
    accessorFn: (row) => row.attachmentCount,
    cell: ({ row }) => {
      const count = row.original.attachmentCount
      const suggested = row.original.suggestedAttachmentCount

      if (count > 0) {
        return <Badge variant="success">Matched</Badge>
      }

      if (suggested > 0) {
        return <Badge variant="warning">Suggested</Badge>
      }

      return <Badge variant="secondary">No attachment</Badge>
    },
    meta: { className: 'whitespace-nowrap' },
  },
  {
    id: 'note',
    minSize: 120,
    header: 'Note',
    accessorFn: (row) => row.note,
    cell: ({ row }) => {
      const note = row.original.note

      if (!note) {
        return <span className="text-muted-foreground">—</span>
      }

      return <span>{note}</span>
    },
  },
]
