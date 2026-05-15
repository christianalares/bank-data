import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { pushAlert } from '#/components/alerts'
import { pushModal } from '#/components/modals'
import { PdfThumbnail } from '#/components/pdf-thumbnail'
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
  const suggestedAttachmentsQuery = useQuery(queries.banking.suggestedAttachments(transaction.id))

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

  const approveSuggestionMutation = useMutation({
    ...mutations.banking.approveSuggestedMatch(),
    onSuccess: () => {
      queryClient.invalidateQueries(queries.banking.transactionAttachments(transaction.id))
      queryClient.invalidateQueries(queries.banking.suggestedAttachments(transaction.id))
      queryClient.invalidateQueries(queries.banking.transactions())
      queryClient.invalidateQueries({ queryKey: ['banking', 'inbox'] })
      toast.success('Match confirmed')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not confirm match'
      toast.error(message)
    },
  })

  const dismissSuggestionMutation = useMutation({
    ...mutations.banking.dismissSuggestedMatch(),
    onSuccess: () => {
      queryClient.invalidateQueries(queries.banking.suggestedAttachments(transaction.id))
      queryClient.invalidateQueries(queries.banking.transactions())
      queryClient.invalidateQueries({ queryKey: ['banking', 'inbox'] })
      toast.success('Suggestion dismissed')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not dismiss suggestion'
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

            {suggestedAttachmentsQuery.data && suggestedAttachmentsQuery.data.length > 0 ? (
              <div className="space-y-2">
                {suggestedAttachmentsQuery.data.map((att) => (
                  <div key={att.id} className="border border-amber-500/30 bg-amber-500/5 p-3">
                    <p className="mb-2 text-[10px] uppercase tracking-wide text-amber-600/70 dark:text-amber-400/70">
                      Potential match from inbox
                    </p>
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full text-left"
                      onClick={() => pushModal('attachmentPreview', { attachment: att })}
                    >
                      <AttachmentThumbnail
                        att={att}
                        size={36}
                        className="shrink-0 rounded-sm overflow-hidden border border-amber-500/20"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-amber-700 dark:text-amber-300">
                        {att.filename}
                      </span>
                      <span className="shrink-0 text-xs text-amber-600/70 dark:text-amber-400/70">
                        {formatBytes(att.sizeBytes)}
                      </span>
                    </button>
                    <div className="mt-2 flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={
                          dismissSuggestionMutation.isPending || approveSuggestionMutation.isPending
                        }
                        onClick={() => dismissSuggestionMutation.mutate({ attachmentId: att.id })}
                      >
                        Dismiss
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={
                          approveSuggestionMutation.isPending || dismissSuggestionMutation.isPending
                        }
                        onClick={() => approveSuggestionMutation.mutate({ attachmentId: att.id })}
                      >
                        Confirm
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {attachmentsQuery.data && attachmentsQuery.data.length > 0 ? (
              <ul className="space-y-1">
                {attachmentsQuery.data.map((att) => (
                  <li key={att.id} className="flex items-center gap-2 border px-2 py-2 text-sm">
                    <button
                      type="button"
                      className="flex items-center gap-2 min-w-0 flex-1"
                      onClick={() => pushModal('attachmentPreview', { attachment: att })}
                    >
                      <AttachmentThumbnail
                        att={att}
                        size={36}
                        className="shrink-0 rounded-sm overflow-hidden border"
                      />
                      <span className="min-w-0 flex-1 truncate text-left text-xs font-medium">
                        {att.filename}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatBytes(att.sizeBytes)}
                      </span>
                    </button>
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

type AttachmentThumbnailProps = {
  att: { contentType: string; signedUrl: string; filename: string; id: string }
  size: number
  className?: string
}

function AttachmentThumbnail({ att, size, className }: AttachmentThumbnailProps) {
  const isImage = att.contentType.startsWith('image/')
  const isPdf = att.contentType === 'application/pdf'

  return (
    <div className={className} style={{ width: size, height: size }}>
      {isImage ? (
        <img src={att.signedUrl} alt={att.filename} className="h-full w-full object-cover" />
      ) : isPdf ? (
        <PdfThumbnail url={att.signedUrl} cacheKey={att.id} width={size} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <Icon name="file" className="size-4 text-muted-foreground/50" />
        </div>
      )}
    </div>
  )
}
