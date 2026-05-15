import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import type { InboxAttachment } from '#/components/inbox/attachment-card'
import { pushModal } from '#/components/modals'
import { PdfViewer } from '#/components/pdf-viewer'
import { Button } from '#/components/ui/button'
import { Icon } from '#/components/ui/icon'
import { Input } from '#/components/ui/input'
import { Separator } from '#/components/ui/separator'
import { SheetContent, SheetDescription, SheetHeader, SheetTitle } from '#/components/ui/sheet'
import { cn } from '#/lib/utils'
import { mutations } from '#/mutations'
import { queries } from '#/queries'

import { popSheet } from '.'

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60">{label}</p>
      <p className="truncate text-xs font-medium">{value}</p>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat('en-SE', { style: 'currency', currency }).format(Number(amount))
}

const dateFormatter = new Intl.DateTimeFormat('en-SE', { dateStyle: 'medium' })

type Props = {
  attachment: InboxAttachment
}

export function InboxAttachmentSheet({ attachment }: Props) {
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()
  const isImage = attachment.contentType.startsWith('image/')
  const isPdf = attachment.contentType === 'application/pdf'

  const transactionsQuery = useQuery(queries.banking.transactions())

  const linkMutation = useMutation({
    ...mutations.banking.linkAttachmentToTransaction(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banking', 'inbox'] })
      queryClient.invalidateQueries(queries.banking.transactions())
      toast.success('Attachment linked to transaction')
      popSheet('inboxAttachment')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not link attachment'
      toast.error(message)
    },
  })

  const unlinkMutation = useMutation({
    ...mutations.banking.unlinkAttachment(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banking', 'inbox'] })
      queryClient.invalidateQueries(queries.banking.transactions())
      toast.success('Attachment unlinked')
      popSheet('inboxAttachment')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not unlink attachment'
      toast.error(message)
    },
  })

  const approveMutation = useMutation({
    ...mutations.banking.approveSuggestedMatch(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banking', 'inbox'] })
      queryClient.invalidateQueries(queries.banking.transactions())
      toast.success('Match confirmed')
      popSheet('inboxAttachment')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not confirm match'
      toast.error(message)
    },
  })

  const dismissMutation = useMutation({
    ...mutations.banking.dismissSuggestedMatch(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banking', 'inbox'] })
      toast.success('Suggestion dismissed')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not dismiss suggestion'
      toast.error(message)
    },
  })

  const transactions = transactionsQuery.data?.transactions ?? []
  const filtered = search.trim()
    ? transactions.filter((t) => {
        const q = search.toLowerCase()
        return (
          t.description.toLowerCase().includes(q) ||
          (t.merchantName?.toLowerCase().includes(q) ?? false) ||
          t.amount.includes(q)
        )
      })
    : transactions

  function handleLink(transactionId: string) {
    linkMutation.mutate({ attachmentId: attachment.id, transactionId })
  }

  return (
    <SheetContent className="sm:max-w-md flex flex-col gap-0 p-0">
      <SheetHeader className="p-4 pb-3">
        <SheetTitle className="text-sm">{attachment.filename}</SheetTitle>
        <SheetDescription>
          {formatBytes(attachment.sizeBytes)} ·{' '}
          {new Intl.DateTimeFormat('en-SE', { dateStyle: 'medium' }).format(
            new Date(attachment.createdAt),
          )}
        </SheetDescription>
      </SheetHeader>

      <div className="relative mx-4 overflow-hidden bg-muted group">
        {isImage ? (
          <img
            src={attachment.signedUrl}
            alt={attachment.filename}
            className="max-h-56 w-full object-contain"
          />
        ) : isPdf ? (
          <div className="max-h-56 overflow-hidden pointer-events-none select-none">
            <PdfViewer url={attachment.signedUrl} maxWidth={400} pageLimit={1} />
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center gap-3 flex-col">
            <Button asChild variant="outline" size="sm">
              <a href={attachment.signedUrl} target="_blank" rel="noreferrer">
                <Icon name="externalLink" className="size-3.5" />
                Open file
              </a>
            </Button>
          </div>
        )}

        {(isImage || isPdf) && (
          <button
            type="button"
            className="absolute right-2 top-2 flex size-7 items-center justify-center bg-background/80 text-foreground backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => pushModal('attachmentPreview', { attachment })}
            aria-label="Expand preview"
          >
            <Icon name="maximize" className="size-3.5" />
          </button>
        )}
      </div>

      {attachment.suggestedTransaction && !attachment.transaction ? (
        <div className="mx-4 mt-4 border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-amber-600/70 dark:text-amber-400/70">
            Potential match found
          </p>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-amber-700 dark:text-amber-300">
                {attachment.suggestedTransaction.merchantName ??
                  attachment.suggestedTransaction.description}
              </p>
              <p className="text-xs text-amber-600/70 dark:text-amber-400/70">
                {formatMoney(
                  attachment.suggestedTransaction.amount,
                  attachment.suggestedTransaction.currency,
                )}{' '}
                · {dateFormatter.format(new Date(attachment.suggestedTransaction.bookedAt))}
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={dismissMutation.isPending || approveMutation.isPending}
                onClick={() => dismissMutation.mutate({ attachmentId: attachment.id })}
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={approveMutation.isPending || dismissMutation.isPending}
                onClick={() => approveMutation.mutate({ attachmentId: attachment.id })}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {!!attachment.parsedInvoice && (
        <div className="mx-4 mt-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Extracted from document</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {!!attachment.parsedInvoice.vendorName && (
              <MetaRow label="Vendor" value={attachment.parsedInvoice.vendorName} />
            )}
            {!!attachment.parsedInvoice.amount && !!attachment.parsedInvoice.currency && (
              <MetaRow
                label="Amount"
                value={formatMoney(
                  attachment.parsedInvoice.amount,
                  attachment.parsedInvoice.currency,
                )}
              />
            )}
            {!!attachment.parsedInvoice.invoiceDate && (
              <MetaRow label="Invoice date" value={attachment.parsedInvoice.invoiceDate} />
            )}
            {!!attachment.parsedInvoice.dueDate && (
              <MetaRow label="Due date" value={attachment.parsedInvoice.dueDate} />
            )}
            {!!attachment.parsedInvoice.invoiceNumber && (
              <MetaRow label="Invoice #" value={attachment.parsedInvoice.invoiceNumber} />
            )}
            {!!attachment.parsedInvoice.currency && !attachment.parsedInvoice.amount && (
              <MetaRow label="Currency" value={attachment.parsedInvoice.currency} />
            )}
          </div>
          {!!attachment.parsedInvoice.lineItems &&
            attachment.parsedInvoice.lineItems.length > 0 && (
              <div className="mt-1 space-y-1">
                {attachment.parsedInvoice.lineItems.map((item, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: line items have no stable id
                  <div key={i} className="flex items-baseline justify-between gap-2">
                    <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                    <p className="text-xs tabular-nums shrink-0">{item.amount}</p>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {!!attachment.transaction && (
        <div className="mx-4 mt-4 border border-green-500/30 bg-green-500/5 p-3">
          <div className="flex items-center gap-2">
            <Icon name="check" className="size-4 shrink-0 text-green-600 dark:text-green-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-green-700 dark:text-green-300">
                {attachment.transaction.merchantName ?? attachment.transaction.description}
              </p>
              <p className="text-xs text-green-600/70 dark:text-green-400/70">
                {formatMoney(attachment.transaction.amount, attachment.transaction.currency)} ·{' '}
                {dateFormatter.format(new Date(attachment.transaction.bookedAt))}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
              disabled={unlinkMutation.isPending}
              onClick={() => unlinkMutation.mutate({ attachmentId: attachment.id })}
            >
              <Icon name="unlink" className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      <Separator className="mx-4 mt-4 w-auto" />

      <div className="flex flex-col gap-3 p-4 flex-1 min-h-0">
        <div className="flex items-center gap-2">
          <Icon name="link" className="size-3.5 text-muted-foreground shrink-0" />
          <p className="text-xs font-medium text-muted-foreground">Link to transaction</p>
        </div>

        <div className="relative">
          <Icon
            name="search"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"
          />
          <Input
            placeholder="Search by description or amount…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {transactionsQuery.isPending ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No transactions found</p>
          ) : (
            filtered.map((t) => {
              const isLinked = attachment.transaction?.id === t.id

              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={linkMutation.isPending}
                  className={cn(
                    'w-full flex items-center gap-3 border px-3 py-2 text-left transition-colors hover:bg-accent disabled:opacity-50',
                    isLinked && 'border-green-500/30 bg-green-500/5',
                  )}
                  onClick={() => handleLink(t.id)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{t.description}</p>
                    {!!t.merchantName && (
                      <p className="truncate text-xs text-muted-foreground">{t.merchantName}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        'text-xs font-medium',
                        Number(t.amount) > 0 ? 'text-green-600' : '',
                      )}
                    >
                      {formatMoney(t.amount, t.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dateFormatter.format(new Date(t.bookedAt))}
                    </p>
                  </div>
                  {isLinked && <Icon name="check" className="size-3.5 text-green-600 shrink-0" />}
                </button>
              )
            })
          )}
        </div>
      </div>
    </SheetContent>
  )
}
