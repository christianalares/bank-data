import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
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
                Transactions will appear here after the next bank sync.
              </EmptyDescription>
            </EmptyHeader>
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
