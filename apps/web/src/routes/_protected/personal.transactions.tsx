import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Textarea } from '#/components/ui/textarea'
import { mutations } from '#/mutations'
import { queries } from '#/queries'

const ALL_ACCOUNTS = 'all'

export const Route = createFileRoute('/_protected/personal/transactions')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(queries.banking.personalTransactions({ limit: 200 }))
  },
  component: PersonalTransactionsPage,
})

function PersonalTransactionsPage() {
  const queryClient = useQueryClient()
  const [draftQuery, setDraftQuery] = useState('')
  const [query, setQuery] = useState('')
  const [accountId, setAccountId] = useState(ALL_ACCOUNTS)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [editing, setEditing] = useState<{
    transactionId: string
    merchantOverride: string
    note: string
  } | null>(null)
  const result = useQuery(
    queries.banking.personalTransactions({
      query: query || undefined,
      accountId: accountId === ALL_ACCOUNTS ? undefined : accountId,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: 500,
    }),
  )
  const data = result.data
  const updateAnnotation = useMutation({
    ...mutations.banking.updateTransactionNote(),
    onSuccess: async () => {
      setEditing(null)
      await queryClient.invalidateQueries({ queryKey: ['banking', 'personal-transactions'] })
      toast.success('Personal transaction updated')
    },
  })
  const reviewTransfer = useMutation({
    ...mutations.banking.reviewPersonalTransfer(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['banking', 'personal-transactions'] })
      toast.success('Transfer review saved')
    },
  })

  function handleSearch(event: FormEvent) {
    event.preventDefault()
    setQuery(draftQuery.trim())
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
                <CardTitle className="text-sm">{account.name}</CardTitle>
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
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Connect a bank and include at least one account from Personal Connections.
          </CardContent>
        </Card>
      )}

      <form className="flex flex-wrap items-end gap-2" onSubmit={handleSearch}>
        <Input
          className="w-72"
          placeholder="Search merchants or concepts…"
          value={draftQuery}
          onChange={(event) => setDraftQuery(event.target.value)}
        />
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ACCOUNTS}>All accounts</SelectItem>
            {data?.accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-40"
          type="date"
          value={dateFrom}
          aria-label="From date"
          onChange={(event) => setDateFrom(event.target.value)}
        />
        <Input
          className="w-40"
          type="date"
          value={dateTo}
          aria-label="To date"
          onChange={(event) => setDateTo(event.target.value)}
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
        {(query || dateFrom || dateTo || accountId !== ALL_ACCOUNTS) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraftQuery('')
              setQuery('')
              setAccountId(ALL_ACCOUNTS)
              setDateFrom('')
              setDateTo('')
            }}
          >
            Clear
          </Button>
        )}
        {result.isFetching && <span className="text-xs text-muted-foreground">Refreshing…</span>}
      </form>

      {editing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Edit transaction</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_auto]"
              onSubmit={(event) => {
                event.preventDefault()
                updateAnnotation.mutate({
                  transactionId: editing.transactionId,
                  merchantOverride: editing.merchantOverride || null,
                  note: editing.note || null,
                  workspaceKind: 'personal',
                })
              }}
            >
              <Input
                aria-label="Merchant name"
                placeholder="Merchant name"
                value={editing.merchantOverride}
                onChange={(event) =>
                  setEditing((current) =>
                    current ? { ...current, merchantOverride: event.target.value } : null,
                  )
                }
              />
              <Textarea
                aria-label="Personal note"
                placeholder="Private note"
                value={editing.note}
                onChange={(event) =>
                  setEditing((current) =>
                    current ? { ...current, note: event.target.value } : null,
                  )
                }
              />
              <div className="flex gap-2">
                <Button type="submit" disabled={updateAnnotation.isPending}>
                  Save
                </Button>
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="overflow-hidden border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Merchant / description</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-36" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.transactions.map((transaction) => (
              <TableRow key={transaction.id}>
                <TableCell className="whitespace-nowrap">
                  {formatDate(transaction.bookedAt)}
                </TableCell>
                <TableCell>
                  <p className="font-medium">
                    {transaction.merchantName ??
                      transaction.counterpartyName ??
                      transaction.description}
                  </p>
                  {(transaction.merchantName || transaction.counterpartyName) && (
                    <p className="max-w-2xl truncate text-xs text-muted-foreground">
                      {transaction.description}
                    </p>
                  )}
                  {transaction.note && (
                    <p className="mt-1 text-xs text-muted-foreground">{transaction.note}</p>
                  )}
                </TableCell>
                <TableCell>{transaction.accountName}</TableCell>
                <TableCell>
                  {transaction.transferState !== 'ordinary' ? (
                    <Badge variant="outline">
                      {transaction.transferState === 'confirmed'
                        ? 'Internal transfer'
                        : 'Possible transfer'}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Booked</span>
                  )}
                </TableCell>
                <TableCell
                  className={`whitespace-nowrap text-right font-medium ${
                    Number(transaction.amount) > 0 ? 'text-green-600' : ''
                  }`}
                >
                  {formatMoney(transaction.amount, transaction.currency)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {transaction.transferState === 'suggested' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewTransfer.isPending}
                          onClick={() =>
                            reviewTransfer.mutate({
                              transactionId: transaction.id,
                              action: 'confirm',
                            })
                          }
                        >
                          Transfer
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={reviewTransfer.isPending}
                          onClick={() =>
                            reviewTransfer.mutate({
                              transactionId: transaction.id,
                              action: 'dismiss',
                            })
                          }
                        >
                          Not
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditing({
                          transactionId: transaction.id,
                          merchantOverride: transaction.merchantName ?? '',
                          note: transaction.note ?? '',
                        })
                      }
                    >
                      Edit
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {data && data.transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                  No matching transactions.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {data?.transactions.length === 500 && (
        <p className="text-xs text-muted-foreground">
          Showing the newest 500 matches. Narrow the dates or search to see older records.
        </p>
      )}
    </div>
  )
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium' }).format(new Date(value))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}
