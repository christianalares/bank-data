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
  const [aspspName, setAspspName] = useState('')
  const [aspspCountry, setAspspCountry] = useState('SE')
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
    return <TransactionsTable transactions={data.transactions} />
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
          <form className="w-full max-w-md" onSubmit={handleConnectBank}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="aspsp-name">Bank / ASPSP name</FieldLabel>
                <Input
                  id="aspsp-name"
                  value={aspspName}
                  placeholder="Example: Skandinaviska Enskilda Banken AB (publ)"
                  onChange={(event) => {
                    setAspspName(event.target.value)
                  }}
                  required
                />
                <FieldDescription>
                  Use the exact Enable Banking ASPSP name for the bank.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="aspsp-country">Country</FieldLabel>
                <Input
                  id="aspsp-country"
                  value={aspspCountry}
                  maxLength={2}
                  onChange={(event) => {
                    setAspspCountry(event.target.value.toUpperCase())
                  }}
                  required
                />
              </Field>
              <Button type="submit" disabled={startAuthorizationMutation.isPending}>
                {startAuthorizationMutation.isPending ? 'Starting connection...' : 'Connect bank'}
              </Button>
            </FieldGroup>
          </form>
        </Empty>
      </CardContent>
    </Card>
  )
}

function TransactionsTable({ transactions }: { transactions: TransactionRow[] }) {
  const { columnSizing } = Route.useLoaderData()
  const table = useTransactionsTable({ transactions, initialColumnSizing: columnSizing })
  const selectedRows = table.getSelectedRowModel().rows
  const hasSelection = selectedRows.length > 0

  function handleExport() {
    console.log('export')
  }

  function handleRowClick(transaction: TransactionRow) {
    pushSheet('transaction', { transaction })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Input className="h-8 w-56" placeholder="Search…" />
        {hasSelection && (
          <span className="text-xs text-muted-foreground">{selectedRows.length} selected</span>
        )}
        <div className="flex-1" />
        {hasSelection && (
          <Button size="sm" variant="outline" onClick={handleExport}>
            Export
          </Button>
        )}
      </div>
      <DataTable table={table} onRowClick={handleRowClick} />
    </div>
  )
}
