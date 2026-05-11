import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { mutations } from '#/mutations'
import { queries } from '#/queries'

export const Route = createFileRoute('/_protected/transactions')({
  loader: ({ context }) => context.queryClient.ensureQueryData(queries.banking.transactions()),
  component: TransactionsPage,
})

const dateFormatter = new Intl.DateTimeFormat('en-SE', {
  dateStyle: 'medium',
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transactions</CardTitle>
        <CardDescription>Latest bank transactions.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.transactions.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell>{dateFormatter.format(new Date(transaction.bookedAt))}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{transaction.description}</span>
                      {transaction.merchantName || transaction.counterpartyName ? (
                        <span className="text-muted-foreground">
                          {transaction.merchantName ?? transaction.counterpartyName}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{transaction.accountName}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{transaction.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatMoney(transaction.amount, transaction.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
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
        )}
      </CardContent>
    </Card>
  )
}

function formatMoney(amount: string, currency: string) {
  return new Intl.NumberFormat('en-SE', {
    style: 'currency',
    currency,
  }).format(Number(amount))
}
