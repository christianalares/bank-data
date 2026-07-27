import { useMutation } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Separator } from '#/components/ui/separator'
import {
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { Textarea } from '#/components/ui/textarea'
import type { PersonalTransactionRow } from '#/features/banking/personal-transaction-columns'
import { mutations } from '#/mutations'

import { popSheet } from '.'

const dateFormatter = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long' })

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

export function PersonalTransactionSheet({ transaction }: { transaction: PersonalTransactionRow }) {
  const [merchantName, setMerchantName] = useState(
    transaction.merchantOverride ?? transaction.originalMerchantName ?? '',
  )
  const [note, setNote] = useState(transaction.note ?? '')
  const updateTransaction = useMutation({
    ...mutations.banking.updateTransactionNote(),
    onSuccess: async (_result, _variables, _onMutateResult, context) => {
      await context.client.invalidateQueries({
        queryKey: ['banking', 'personal-transactions'],
      })
      toast.success('Personal transaction updated')
      popSheet('personalTransaction')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update transaction')
    },
  })
  const reviewTransfer = useMutation({
    ...mutations.banking.reviewPersonalTransfer(),
    onSuccess: async (_result, _variables, _onMutateResult, context) => {
      await context.client.invalidateQueries({
        queryKey: ['banking', 'personal-transactions'],
      })
      toast.success('Transfer review saved')
      popSheet('personalTransaction')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not review transfer')
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateTransaction.mutate({
      transactionId: transaction.id,
      merchantOverride: merchantName.trim() || null,
      note: note.trim() || null,
      workspaceKind: 'personal',
    })
  }

  return (
    <SheetContent className="sm:max-w-md">
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
        <SheetHeader>
          <SheetTitle>
            <span className={Number(transaction.amount) < 0 ? 'text-destructive' : undefined}>
              {formatMoney(transaction.amount, transaction.currency)}
            </span>
          </SheetTitle>
          <SheetDescription>
            {dateFormatter.format(new Date(transaction.bookedAt))}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <FieldGroup>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
              <dt className="text-muted-foreground">Description</dt>
              <dd className="font-medium">{transaction.description}</dd>

              {transaction.counterpartyName ? (
                <>
                  <dt className="text-muted-foreground">Counterparty</dt>
                  <dd>{transaction.counterpartyName}</dd>
                </>
              ) : null}

              <dt className="text-muted-foreground">Account</dt>
              <dd>{transaction.accountName}</dd>

              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <Badge
                  variant={
                    transaction.status === 'pending'
                      ? 'warning'
                      : transaction.transferState === 'ordinary'
                        ? 'secondary'
                        : 'outline'
                  }
                >
                  {getTransferLabel(transaction)}
                </Badge>
              </dd>

              {transaction.balanceAfterTransaction ? (
                <>
                  <dt className="text-muted-foreground">Balance after</dt>
                  <dd>{formatMoney(transaction.balanceAfterTransaction, transaction.currency)}</dd>
                </>
              ) : null}
            </dl>

            {transaction.transferState === 'suggested' ? (
              <>
                <Separator />
                <Field>
                  <FieldLabel>Possible internal transfer</FieldLabel>
                  <FieldDescription>
                    Confirm this when it is money moving between two of your own accounts.
                  </FieldDescription>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={reviewTransfer.isPending}
                      onClick={() =>
                        reviewTransfer.mutate({
                          transactionId: transaction.id,
                          action: 'dismiss',
                        })
                      }
                    >
                      Not a transfer
                    </Button>
                    <Button
                      type="button"
                      disabled={reviewTransfer.isPending}
                      onClick={() =>
                        reviewTransfer.mutate({
                          transactionId: transaction.id,
                          action: 'confirm',
                        })
                      }
                    >
                      Confirm transfer
                    </Button>
                  </div>
                </Field>
              </>
            ) : null}

            <Separator />

            <Field>
              <FieldLabel htmlFor="personal-transaction-merchant">Merchant name</FieldLabel>
              <Input
                id="personal-transaction-merchant"
                value={merchantName}
                placeholder="Add a clearer merchant name"
                onChange={(event) => setMerchantName(event.target.value)}
              />
              {transaction.originalMerchantName ? (
                <FieldDescription>
                  Bank-provided merchant: {transaction.originalMerchantName}
                </FieldDescription>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="personal-transaction-note">Private note</FieldLabel>
              <Textarea
                id="personal-transaction-note"
                value={note}
                placeholder="Add a private note…"
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          </FieldGroup>
        </div>

        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => popSheet('personalTransaction')}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateTransaction.isPending}>
            {updateTransaction.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </SheetFooter>
      </form>
    </SheetContent>
  )
}
