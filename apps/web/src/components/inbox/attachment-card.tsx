import type * as React from 'react'
import { PdfThumbnail } from '#/components/pdf-thumbnail'
import { Icon } from '#/components/ui/icon'
import { Skeleton } from '#/components/ui/skeleton'
import type { DatabaseTable } from '#db'
import { Button } from '../ui/button'

type TransactionSummary = Pick<
  DatabaseTable.BankTransaction,
  'id' | 'description' | 'merchantName' | 'amount' | 'currency'
> & { bookedAt: string }

export type InboxAttachment = Pick<
  DatabaseTable.Attachment,
  'id' | 'filename' | 'contentType' | 'sizeBytes' | 'status' | 'source' | 'parsedInvoice'
> & {
  createdAt: string
  signedUrl: string
  transaction: TransactionSummary | null
  suggestedTransaction: TransactionSummary | null
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

function formatDate(isoString: string): string {
  return new Intl.DateTimeFormat('en-SE', { dateStyle: 'medium' }).format(new Date(isoString))
}

function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat('en-SE', { style: 'currency', currency }).format(Number(amount))
}

type Props = {
  attachment: InboxAttachment
  onClick: () => void
  onDelete: (event: React.MouseEvent) => void
  onUnlink: (event: React.MouseEvent) => void
  onExpand: (event: React.MouseEvent) => void
}

export function AttachmentCard({ attachment, onClick, onDelete, onUnlink, onExpand }: Props) {
  const isImage = attachment.contentType.startsWith('image/')
  const isPdf = attachment.contentType === 'application/pdf'
  const isMatched = attachment.transaction !== null
  const label = attachment.transaction?.merchantName ?? attachment.transaction?.description

  return (
    <button
      type="button"
      className="group w-full overflow-hidden border bg-card cursor-pointer transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-left"
      onClick={onClick}
    >
      <div className="relative aspect-square bg-muted">
        {isImage ? (
          <img
            src={attachment.signedUrl}
            alt={attachment.filename}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : attachment.contentType === 'application/pdf' ? (
          <PdfThumbnail url={attachment.signedUrl} cacheKey={attachment.id} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Icon name="file" className="size-10 text-muted-foreground/50" />
          </div>
        )}

        <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
          {(isImage || isPdf) && (
            <Button
              size="icon-xs"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation()
                onExpand(e)
              }}
            >
              <Icon name="maximize" className="size-3" />
            </Button>
          )}

          {isMatched && (
            <Button
              size="icon-xs"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation()
                onUnlink(e)
              }}
            >
              <Icon name="unlink" className="" />
            </Button>
          )}

          <Button
            size="icon-xs"
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(e)
            }}
          >
            <Icon name="trash" className="" />
          </Button>
        </div>
      </div>

      <div className="p-2.5">
        <p className="truncate text-xs font-medium">{attachment.filename}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatDate(attachment.createdAt)} · {formatBytes(attachment.sizeBytes)}
        </p>
        {isMatched && attachment.transaction ? (
          <p className="mt-1 truncate text-xs text-green-600 dark:text-green-400">
            {label} · {formatMoney(attachment.transaction.amount, attachment.transaction.currency)}
          </p>
        ) : attachment.status === 'suggested' && attachment.suggestedTransaction ? (
          <p className="mt-1 truncate text-xs text-amber-600 dark:text-amber-400">
            {attachment.suggestedTransaction.merchantName ??
              attachment.suggestedTransaction.description}{' '}
            ·{' '}
            {formatMoney(
              attachment.suggestedTransaction.amount,
              attachment.suggestedTransaction.currency,
            )}
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground/60">Unmatched</p>
        )}
      </div>
    </button>
  )
}

export function AttachmentCardSkeleton() {
  return (
    <div className="overflow-hidden border bg-card">
      <Skeleton className="aspect-square w-full" />
      <div className="p-2.5 space-y-1.5">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  )
}
