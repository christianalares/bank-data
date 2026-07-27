import { useDebouncedCallback } from '@tanstack/react-pacer'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { type ColumnSizingState, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { PencilIcon } from 'lucide-react'
import type { FormEvent } from 'react'
import { useCallback, useMemo, useState } from 'react'

import { pushSheet } from '#/components/sheets'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { DataTable } from '#/components/ui/data-table'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { MonthPicker } from '#/components/ui/month-picker'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  getPersonalTransactionColumnSizing,
  savePersonalTransactionColumnSizing,
} from '#/features/banking/column-sizing'
import {
  createPersonalTransactionColumns,
  type PersonalTransactionRow,
} from '#/features/banking/personal-transaction-columns'
import { queries } from '#/queries'

const ALL_ACCOUNTS = 'all'

export const Route = createFileRoute('/_protected/personal/transactions')({
  loader: async ({ context }) => {
    const [, columnSizing] = await Promise.all([
      context.queryClient.ensureQueryData(queries.banking.personalTransactions({ limit: 500 })),
      getPersonalTransactionColumnSizing(),
    ])

    return { columnSizing }
  },
  component: PersonalTransactionsPage,
})

function PersonalTransactionsPage() {
  const { columnSizing: initialColumnSizing } = Route.useLoaderData()
  const [draftQuery, setDraftQuery] = useState('')
  const [query, setQuery] = useState('')
  const [accountId, setAccountId] = useState(ALL_ACCOUNTS)
  const [month, setMonth] = useState<Date | null>(null)
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(initialColumnSizing)
  const dateRange = getMonthRange(month)
  const result = useQuery(
    queries.banking.personalTransactions({
      query: query || undefined,
      accountId: accountId === ALL_ACCOUNTS ? undefined : accountId,
      dateFrom: dateRange?.dateFrom,
      dateTo: dateRange?.dateTo,
      limit: 500,
    }),
  )
  const data = result.data
  const columns = useMemo(
    () =>
      createPersonalTransactionColumns({
        onEdit: (transaction) => pushSheet('personalTransaction', { transaction }),
      }),
    [],
  )
  const debouncedSave = useDebouncedCallback(savePersonalTransactionColumnSizing, {
    wait: 300,
  })
  const handleColumnSizingChange = useCallback(
    (updater: ColumnSizingState | ((previous: ColumnSizingState) => ColumnSizingState)) => {
      setColumnSizing((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater
        debouncedSave(next)
        return next
      })
    },
    [debouncedSave],
  )
  const table = useReactTable({
    data: (data?.transactions ?? []) as PersonalTransactionRow[],
    columns,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    state: { columnSizing },
    onColumnSizingChange: handleColumnSizingChange,
    getRowId: (row) => row.id,
  })

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setQuery(draftQuery.trim())
  }

  function clearFilters() {
    setDraftQuery('')
    setQuery('')
    setAccountId(ALL_ACCOUNTS)
    setMonth(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Personal transactions</h1>
        <p className="text-sm text-muted-foreground">
          Read-only history from the personal bank accounts you selected.
        </p>
      </div>

      {data?.accounts.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.accounts.map((account) => (
            <Card key={account.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start gap-2">
                  <CardTitle className="min-w-0 flex-1 truncate text-sm">{account.name}</CardTitle>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Rename ${account.name}`}
                    onClick={() => pushSheet('personalAccount', { account })}
                  >
                    <PencilIcon data-icon="inline-start" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold">
                  {formatMoney(account.currentBalance, account.currency)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Updated {formatDateTime(account.updatedAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No personal accounts included</EmptyTitle>
            <EmptyDescription>
              Connect a bank and include at least one account from Personal Connections.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <form onSubmit={handleSearch}>
        <FieldGroup className="flex-row flex-wrap items-end gap-2">
          <Field className="w-72">
            <FieldLabel className="sr-only" htmlFor="personal-transaction-search">
              Search transactions
            </FieldLabel>
            <Input
              id="personal-transaction-search"
              placeholder="Search merchants or concepts…"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
            />
          </Field>
          <Field className="w-52">
            <FieldLabel className="sr-only" htmlFor="personal-account-filter">
              Account
            </FieldLabel>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="personal-account-filter" className="w-full">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ALL_ACCOUNTS}>All accounts</SelectItem>
                  {data?.accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field className="w-auto">
            <FieldLabel className="sr-only">Month</FieldLabel>
            <MonthPicker value={month} onChange={setMonth} />
          </Field>
          <Field orientation="horizontal" className="w-auto">
            <Button type="submit" variant="outline">
              Search
            </Button>
            {query || month || accountId !== ALL_ACCOUNTS ? (
              <Button type="button" variant="ghost" onClick={clearFilters}>
                Clear
              </Button>
            ) : null}
          </Field>
          {result.isFetching ? (
            <span className="pb-2 text-xs text-muted-foreground">Refreshing…</span>
          ) : null}
        </FieldGroup>
      </form>

      {data && data.transactions.length > 0 ? (
        <DataTable
          table={table}
          onRowClick={(transaction) => pushSheet('personalTransaction', { transaction })}
        />
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No matching transactions</EmptyTitle>
            <EmptyDescription>Try another search, account, or month.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {data?.transactions.length === 500 ? (
        <p className="text-xs text-muted-foreground">
          Showing the newest 500 matches. Narrow the month, account, or search to see older records.
        </p>
      ) : null}
    </div>
  )
}

function getMonthRange(month: Date | null) {
  if (!month) {
    return null
  }

  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0)

  return {
    dateFrom: formatInputDate(firstDay),
    dateTo: formatInputDate(lastDay),
  }
}

function formatInputDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatMoney(amount: string | null, currency: string) {
  if (amount === null) {
    return '—'
  }

  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency,
  }).format(Number(amount))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}
