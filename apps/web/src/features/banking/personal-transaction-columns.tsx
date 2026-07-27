import type { ColumnDef } from '@tanstack/react-table'
import { PencilIcon } from 'lucide-react'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'

export type PersonalTransactionRow = {
  id: string
  accountId: string
  accountName: string
  bookedAt: string
  amount: string
  currency: string
  description: string
  merchantName: string | null
  originalMerchantName: string | null
  merchantOverride: string | null
  counterpartyName: string | null
  note: string | null
  status: 'booked' | 'pending'
  balanceAfterTransaction: string | null
  transferState: 'ordinary' | 'suggested' | 'confirmed' | 'dismissed'
  transferPairId: string | null
  transferConfidence: string | null
}

const dateFormatter = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium' })

function formatMoney(amount: string, currency: string) {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency,
  }).format(Number(amount))
}

function getTransferLabel(transaction: PersonalTransactionRow) {
  if (transaction.transferState === 'confirmed') {
    return 'Internal transfer'
  }

  if (transaction.transferState === 'suggested') {
    return 'Possible transfer'
  }

  if (transaction.status === 'pending') {
    return 'Pending'
  }

  return 'Booked'
}

export function createPersonalTransactionColumns({
  onEdit,
}: {
  onEdit: (transaction: PersonalTransactionRow) => void
}): ColumnDef<PersonalTransactionRow>[] {
  return [
    {
      id: 'bookedAt',
      minSize: 90,
      header: 'Date',
      accessorFn: (row) => row.bookedAt,
      cell: ({ row }) => dateFormatter.format(new Date(row.original.bookedAt)),
      meta: { className: 'whitespace-nowrap' },
    },
    {
      id: 'description',
      minSize: 160,
      header: 'Description',
      accessorFn: (row) => row.merchantName ?? row.counterpartyName ?? row.description,
      cell: ({ row }) => {
        const transaction = row.original
        const title =
          transaction.merchantName ?? transaction.counterpartyName ?? transaction.description
        const showDescription = title !== transaction.description

        return (
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{title}</span>
            {showDescription ? (
              <span className="truncate text-muted-foreground">{transaction.description}</span>
            ) : null}
          </div>
        )
      },
    },
    {
      id: 'accountName',
      minSize: 100,
      header: 'Account',
      accessorFn: (row) => row.accountName,
      cell: ({ row }) => <span className="truncate">{row.original.accountName}</span>,
    },
    {
      id: 'amount',
      minSize: 90,
      header: 'Amount',
      accessorFn: (row) => row.amount,
      cell: ({ row }) => (
        <span className="font-medium">
          {formatMoney(row.original.amount, row.original.currency)}
        </span>
      ),
      meta: { className: 'text-right whitespace-nowrap', headerClassName: 'text-right' },
    },
    {
      id: 'balanceAfterTransaction',
      minSize: 90,
      header: 'Balance after',
      accessorFn: (row) => row.balanceAfterTransaction,
      cell: ({ row }) =>
        row.original.balanceAfterTransaction ? (
          formatMoney(row.original.balanceAfterTransaction, row.original.currency)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      meta: { className: 'text-right whitespace-nowrap', headerClassName: 'text-right' },
    },
    {
      id: 'transferState',
      minSize: 100,
      header: 'Status',
      accessorFn: (row) => row.transferState,
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.status === 'pending'
              ? 'warning'
              : row.original.transferState === 'ordinary'
                ? 'secondary'
                : 'outline'
          }
        >
          {getTransferLabel(row.original)}
        </Badge>
      ),
      meta: { className: 'whitespace-nowrap' },
    },
    {
      id: 'note',
      minSize: 120,
      header: 'Note',
      accessorFn: (row) => row.note,
      cell: ({ row }) =>
        row.original.note ? (
          <span className="truncate">{row.original.note}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'actions',
      size: 76,
      enableResizing: false,
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation()
              onEdit(row.original)
            }}
          >
            <PencilIcon data-icon="inline-start" />
            Edit
          </Button>
        </div>
      ),
      meta: {
        className: 'whitespace-nowrap',
        headerClassName: 'w-20',
      },
    },
  ]
}
