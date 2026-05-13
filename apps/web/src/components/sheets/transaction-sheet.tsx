import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { pushAlert } from '#/components/alerts'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Icon } from '#/components/ui/icon'
import { Separator } from '#/components/ui/separator'
import { SheetContent, SheetDescription, SheetHeader, SheetTitle } from '#/components/ui/sheet'
import { Textarea } from '#/components/ui/textarea'
import { UploadZone } from '#/components/upload-zone'
import type { TransactionRow } from '#/features/banking/transaction-columns'
import { mutations } from '#/mutations'
import { queries } from '#/queries'
import { serverFns } from '#/server-fns'

function formatMoney(amount: string, currency: string) {
  return new Intl.NumberFormat('en-SE', {
    style: 'currency',
    currency,
  }).format(Number(amount))
}

type Props = {
  transaction: TransactionRow
}

const dateFormatter = new Intl.DateTimeFormat('en-SE', { dateStyle: 'long' })

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function TransactionSheet({ transaction }: Props) {
  const [note, setNote] = useState(transaction.note ?? '')
  const queryClient = useQueryClient()

  const attachmentsQuery = useQuery(queries.banking.transactionAttachments(transaction.id))

  const updateNoteMutation = useMutation({
    ...mutations.banking.updateTransactionNote(),
    onSuccess: async (_result, _variables, _onMutateResult, context) => {
      await context.client.invalidateQueries(queries.banking.transactions())
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not save note'
      toast.error(message)
    },
  })

  const uploadAttachmentsMutation = useMutation({
    ...mutations.banking.uploadAttachments(),
    onSuccess: () => {
      queryClient.invalidateQueries(queries.banking.transactionAttachments(transaction.id))
      queryClient.invalidateQueries(queries.banking.transactions())
      toast.success('Uploaded')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Upload failed'
      toast.error(message)
    },
  })

  const unlinkAttachmentMutation = useMutation({
    ...mutations.banking.unlinkAttachment(),
    onSuccess: () => {
      queryClient.invalidateQueries(queries.banking.transactionAttachments(transaction.id))
      queryClient.invalidateQueries(queries.banking.transactions())
      queryClient.invalidateQueries({ queryKey: ['banking', 'inbox'] })
      toast.success('Attachment unlinked')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not unlink attachment'
      toast.error(message)
    },
  })

  function handleNoteBlur() {
    const trimmedNote = note.trim()
    const savedNote = transaction.note ?? ''

    if (trimmedNote === savedNote) {
      return
    }

    updateNoteMutation.mutate({
      transactionId: transaction.id,
      note: trimmedNote || null,
    })
  }

  const handleFiles = useCallback(
    (files: File[]) => {
      const formData = new FormData()
      formData.append('transactionId', transaction.id)
      for (const file of files) {
        formData.append('files', file)
      }
      uploadAttachmentsMutation.mutate(formData)
    },
    [transaction.id, uploadAttachmentsMutation],
  )

  async function handleOpenAttachment(attachmentId: string) {
    try {
      const { url } = await serverFns.banking.getAttachmentSignedUrl({
        data: { attachmentId },
      })
      window.open(url, '_blank')
    } catch {
      toast.error('Could not open attachment')
    }
  }

  const amount = Number(transaction.amount)
  const isDebit = amount < 0

  return (
    <SheetContent className="sm:max-w-md">
      <div className="flex min-h-0 flex-1 flex-col">
        <SheetHeader>
          <SheetTitle>
            <span className={isDebit ? 'text-destructive' : undefined}>
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

              {transaction.merchantName ? (
                <>
                  <dt className="text-muted-foreground">Merchant</dt>
                  <dd>{transaction.merchantName}</dd>
                </>
              ) : null}

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
                <Badge variant="secondary">{transaction.status}</Badge>
              </dd>

              {transaction.balanceAfterTransaction ? (
                <>
                  <dt className="text-muted-foreground">Balance after</dt>
                  <dd>{formatMoney(transaction.balanceAfterTransaction, transaction.currency)}</dd>
                </>
              ) : null}
            </dl>

            <Field>
              <FieldLabel htmlFor="transaction-note">Note</FieldLabel>
              <Textarea
                id="transaction-note"
                value={note}
                placeholder="Add a note…"
                onChange={(event) => setNote(event.target.value)}
                onBlur={handleNoteBlur}
                disabled={updateNoteMutation.isPending}
              />
            </Field>
          </FieldGroup>

          <Separator className="my-4" />

          <div className="space-y-3">
            <p className="text-sm font-medium">Attachments</p>

            {attachmentsQuery.data && attachmentsQuery.data.length > 0 ? (
              <ul className="space-y-1">
                {attachmentsQuery.data.map((att) => (
                  <li key={att.id} className="flex items-center gap-2 border px-3 py-2 text-sm">
                    <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left hover:underline"
                      onClick={() => handleOpenAttachment(att.id)}
                    >
                      {att.filename}
                    </button>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatBytes(att.sizeBytes)}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                      disabled={unlinkAttachmentMutation.isPending}
                      onClick={() => unlinkAttachmentMutation.mutate({ attachmentId: att.id })}
                    >
                      <Icon name="unlink" className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        pushAlert('confirmDeleteAttachment', {
                          attachmentId: att.id,
                          transactionId: transaction.id,
                        })
                      }
                    >
                      <Icon name="trash" className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}

            <UploadZone onFiles={handleFiles} disabled={uploadAttachmentsMutation.isPending} />
          </div>
        </div>
      </div>
    </SheetContent>
  )
}
