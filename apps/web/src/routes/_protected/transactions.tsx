import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'

import { pushSheet } from '#/components/sheets'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { DataTable } from '#/components/ui/data-table'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { MonthPicker } from '#/components/ui/month-picker'
import { getTransactionColumnSizing } from '#/features/banking/column-sizing'
import type { TransactionRow } from '#/features/banking/transaction-columns'
import { useTransactionsTable } from '#/features/banking/use-transactions-table'
import { mutations } from '#/mutations'
import { queries } from '#/queries'

export const Route = createFileRoute('/_protected/transactions')({
  loader: async ({ context }) => {
    const [, columnSizing] = await Promise.all([
      context.queryClient.ensureQueryData(queries.banking.transactions()),
      getTransactionColumnSizing(),
    ])
    return { columnSizing }
  },
  component: TransactionsPage,
})

function TransactionsPage() {
  const { data } = useSuspenseQuery(queries.banking.transactions())
  const [aspspName, setAspspName] = useState(data.stats.providerName ?? '')
  const [aspspCountry, setAspspCountry] = useState(data.stats.providerCountry)
  const startAuthorizationMutation = useMutation({
    ...mutations.banking.startEnableBankingAuthorization(),
    onSuccess: (result) => {
      window.location.href = result.url
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not start bank connection'
      toast.error(message)
    },
  })

  function handleConnectBank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    startAuthorizationMutation.mutate({
      aspspName,
      aspspCountry,
      psuType: 'business',
    })
  }

  if (data.transactions.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        {data.stats.connectionStatus === 'disconnected' ||
        data.stats.connectionStatus === 'error' ? (
          <BankConnectionNotice
            aspspName={aspspName}
            aspspCountry={aspspCountry}
            errorMessage={data.stats.errorMessage}
            lastSyncedAt={data.stats.lastSyncedAt}
            isPending={startAuthorizationMutation.isPending}
            onAspspNameChange={setAspspName}
            onAspspCountryChange={setAspspCountry}
            onSubmit={handleConnectBank}
          />
        ) : null}
        <TransactionsTable transactions={data.transactions} />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No transactions yet</EmptyTitle>
            <EmptyDescription>
              Connect the production bank account once, then scheduled jobs will keep this list up
              to date.
            </EmptyDescription>
          </EmptyHeader>
          <BankConnectionForm
            aspspName={aspspName}
            aspspCountry={aspspCountry}
            buttonLabel="Connect bank"
            isPending={startAuthorizationMutation.isPending}
            onAspspNameChange={setAspspName}
            onAspspCountryChange={setAspspCountry}
            onSubmit={handleConnectBank}
          />
        </Empty>
      </CardContent>
    </Card>
  )
}

type BankConnectionFormProps = {
  aspspName: string
  aspspCountry: string
  buttonLabel: string
  isPending: boolean
  onAspspNameChange: (value: string) => void
  onAspspCountryChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

function BankConnectionForm({
  aspspName,
  aspspCountry,
  buttonLabel,
  isPending,
  onAspspNameChange,
  onAspspCountryChange,
  onSubmit,
}: BankConnectionFormProps) {
  return (
    <form className="w-full max-w-md" onSubmit={onSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="aspsp-name">Bank / ASPSP name</FieldLabel>
          <Input
            id="aspsp-name"
            value={aspspName}
            placeholder="Example: Skandinaviska Enskilda Banken AB (publ)"
            onChange={(event) => onAspspNameChange(event.target.value)}
            required
          />
          <FieldDescription>Use the exact Enable Banking ASPSP name for the bank.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="aspsp-country">Country</FieldLabel>
          <Input
            id="aspsp-country"
            value={aspspCountry}
            maxLength={2}
            onChange={(event) => onAspspCountryChange(event.target.value.toUpperCase())}
            required
          />
        </Field>
        <Button type="submit" disabled={isPending || !aspspName.trim()}>
          {isPending ? 'Starting connection...' : buttonLabel}
        </Button>
      </FieldGroup>
    </form>
  )
}

function BankConnectionNotice({
  aspspName,
  aspspCountry,
  errorMessage,
  lastSyncedAt,
  isPending,
  onAspspNameChange,
  onAspspCountryChange,
  onSubmit,
}: Omit<BankConnectionFormProps, 'buttonLabel'> & {
  errorMessage: string | null
  lastSyncedAt: string | null
}) {
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardHeader>
        <CardTitle>Bank connection needs attention</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl space-y-1">
          <p className="font-medium text-destructive">Daily transaction sync has stopped.</p>
          <p className="text-muted-foreground">
            {getConnectionErrorMessage(errorMessage)} Reconnect the bank to import newer
            transactions and resume daily sync.
          </p>
          {lastSyncedAt ? (
            <p className="text-muted-foreground">
              Last successful sync: {formatDateTime(lastSyncedAt)}
            </p>
          ) : null}
        </div>
        <BankConnectionForm
          aspspName={aspspName}
          aspspCountry={aspspCountry}
          buttonLabel="Reconnect bank"
          isPending={isPending}
          onAspspNameChange={onAspspNameChange}
          onAspspCountryChange={onAspspCountryChange}
          onSubmit={onSubmit}
        />
      </CardContent>
    </Card>
  )
}

function getConnectionErrorMessage(errorMessage: string | null) {
  if (
    errorMessage?.includes('CLOSED_SESSION') ||
    errorMessage?.includes('(401)') ||
    errorMessage?.includes('(403)')
  ) {
    return 'The bank ended the previous authorization session.'
  }

  return errorMessage || 'The bank connection is unavailable.'
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function TransactionsTable({ transactions }: { transactions: TransactionRow[] }) {
  const { columnSizing } = Route.useLoaderData()
  const { table, search, setSearch, month, setMonth } = useTransactionsTable({
    transactions,
    initialColumnSizing: columnSizing,
  })
  const selectedRows = table.getSelectedRowModel().rows
  const hasSelection = selectedRows.length > 0
  const exportMutation = useMutation(mutations.banking.exportTransactions())

  function handleExport() {
    const transactionIds = selectedRows.map((row) => row.original.id)

    if (transactionIds.length === 0) {
      return
    }

    const promise = exportMutation.mutateAsync({ transactionIds }).then(async (response) => {
      const blob = await response.blob()
      const filename = response.headers.get('X-Export-Filename') ?? 'transactions-export.zip'
      triggerBlobDownload(blob, filename)
      return transactionIds.length
    })

    toast.promise(promise, {
      loading: 'Exporting…',
      success: (count) => `Exported ${count} transaction${count === 1 ? '' : 's'}`,
      error: (error) => (error instanceof Error ? error.message : 'Export failed'),
    })
  }

  function handleRowClick(transaction: TransactionRow) {
    pushSheet('transaction', { transaction })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Input
          className="w-56"
          placeholder="Search…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <MonthPicker value={month} onChange={setMonth} />
        {hasSelection && (
          <span className="text-xs text-muted-foreground">{selectedRows.length} selected</span>
        )}
        <div className="flex-1" />
        {hasSelection && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={exportMutation.isPending}
          >
            {exportMutation.isPending ? 'Exporting…' : 'Export'}
          </Button>
        )}
      </div>
      <DataTable table={table} onRowClick={handleRowClick} />
    </div>
  )
}
