import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import { pushAlert } from '#/components/alerts'
import type { InboxAttachment } from '#/components/inbox/attachment-card'
import { AttachmentCard, AttachmentCardSkeleton } from '#/components/inbox/attachment-card'
import { pushModal } from '#/components/modals'
import { pushSheet } from '#/components/sheets'
import { Button } from '#/components/ui/button'
import { Icon } from '#/components/ui/icon'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { cn } from '#/lib/utils'
import { mutations } from '#/mutations'
import { queries } from '#/queries'

export const Route = createFileRoute('/_protected/inbox')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(queries.banking.inboxAttachments('all')),
      context.queryClient.ensureQueryData(queries.banking.inboxAttachments('matched')),
      context.queryClient.ensureQueryData(queries.banking.inboxAttachments('unmatched')),
      context.queryClient.ensureQueryData(queries.banking.gmailConnection()),
    ])
  },
  component: InboxPage,
})

const ACCEPTED_TYPES = {
  'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  'application/pdf': ['.pdf'],
}

type TabValue = 'all' | 'matched' | 'unmatched'

function InboxPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [activeTab, setActiveTab] = useState<TabValue>('unmatched')

  const allQuery = useQuery(queries.banking.inboxAttachments('all'))
  const matchedQuery = useQuery(queries.banking.inboxAttachments('matched'))
  const unmatchedQuery = useQuery(queries.banking.inboxAttachments('unmatched'))
  const gmailQuery = useQuery(queries.banking.gmailConnection())

  // Show toast notifications based on OAuth redirect params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('gmailConnected') === '1') {
      toast.success('Gmail connected — syncing PDFs now')
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (params.get('gmailError')) {
      toast.error(`Gmail error: ${params.get('gmailError')}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const uploadMutation = useMutation({
    ...mutations.banking.uploadAttachments(),
    onSuccess: (_result, _variables, _context, context) => {
      context.client.invalidateQueries(queries.banking.inboxAttachments('all'))
      context.client.invalidateQueries(queries.banking.inboxAttachments('matched'))
      context.client.invalidateQueries(queries.banking.inboxAttachments('unmatched'))
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Upload failed'
      toast.error(message)
    },
    onSettled: () => {
      setPendingCount((c) => Math.max(0, c - 1))
    },
  })

  const handleFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return
      }

      setPendingCount((c) => c + files.length)

      for (const file of files) {
        const formData = new FormData()
        formData.append('files', file)
        uploadMutation.mutate(formData)
      }
    },
    [uploadMutation],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPTED_TYPES,
    multiple: true,
    noClick: true,
    onDrop: handleFiles,
    onDropRejected: () => {
      toast.error('Only images and PDF files are allowed')
    },
  })

  function handleUploadButtonClick() {
    fileInputRef.current?.click()
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    handleFiles(files)
    event.target.value = ''
  }

  const unlinkMutation = useMutation({
    ...mutations.banking.unlinkAttachment(),
    onSuccess: (_result, _variables, _context, context) => {
      context.client.invalidateQueries(queries.banking.inboxAttachments('all'))
      context.client.invalidateQueries(queries.banking.inboxAttachments('matched'))
      context.client.invalidateQueries(queries.banking.inboxAttachments('unmatched'))
      context.client.invalidateQueries(queries.banking.transactions())
      toast.success('Attachment unlinked')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not unlink attachment'
      toast.error(message)
    },
  })

  const disconnectGmailMutation = useMutation({
    ...mutations.banking.disconnectGmail(),
    onSuccess: (_result, _variables, _context, context) => {
      context.client.invalidateQueries(queries.banking.gmailConnection())
      toast.success('Gmail disconnected')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not disconnect Gmail'
      toast.error(message)
    },
  })

  const syncGmailMutation = useMutation({
    ...mutations.banking.triggerGmailSync(),
    onSuccess: () => {
      toast.success('Gmail sync triggered — PDFs will appear shortly')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not trigger Gmail sync'
      toast.error(message)
    },
  })

  function handleDeleteAttachment(attachmentId: string) {
    pushAlert('confirmDeleteAttachment', { attachmentId })
  }

  function handleUnlinkAttachment(attachmentId: string) {
    unlinkMutation.mutate({ attachmentId })
  }

  const queryForTab = {
    all: allQuery,
    matched: matchedQuery,
    unmatched: unmatchedQuery,
  }

  const activeAttachments = queryForTab[activeTab].data ?? []
  const counts = {
    all: allQuery.data?.length ?? 0,
    matched: matchedQuery.data?.length ?? 0,
    unmatched: unmatchedQuery.data?.length ?? 0,
  }

  return (
    <div {...getRootProps()} className="relative flex h-full flex-col outline-none">
      <input {...getInputProps()} />

      {isDragActive ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 border-2 border-dashed border-primary px-16 py-12">
            <Icon name="upload" className="size-10 text-primary" />
            <p className="text-lg font-medium text-primary">Drop to upload</p>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Icon name="inbox" className="size-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Inbox</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFileInputChange}
          />

          {gmailQuery.data ? (
            <>
              <div className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-muted-foreground">
                <Icon name="mail" className="size-3.5 text-green-500" />
                <span>{gmailQuery.data.email}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-muted-foreground"
                onClick={() => syncGmailMutation.mutate()}
                disabled={syncGmailMutation.isPending}
              >
                <Icon name="refreshCw" className="mr-1 size-3" />
                Sync
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-muted-foreground"
                onClick={() => disconnectGmailMutation.mutate()}
                disabled={disconnectGmailMutation.isPending}
              >
                Disconnect
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" asChild>
              <a href="/api/gmail/connect">
                <Icon name="mail" className="mr-1.5 size-3.5" />
                Connect Gmail
              </a>
            </Button>
          )}

          <Button size="sm" variant="outline" onClick={handleUploadButtonClick}>
            <Icon name="upload" className="mr-1.5 size-3.5" />
            Upload
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
          <TabsList>
            <TabsTrigger value="all">
              All
              {counts.all > 0 && (
                <span className="ml-1.5 bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {counts.all}
                </span>
              )}
            </TabsTrigger>

            <TabsTrigger value="unmatched">
              Unmatched
              {counts.unmatched > 0 && (
                <span className="ml-1.5 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {counts.unmatched}
                </span>
              )}
            </TabsTrigger>

            <TabsTrigger value="matched">
              Matched
              {counts.matched > 0 && (
                <span className="ml-1.5 bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {counts.matched}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {(['all', 'matched', 'unmatched'] as const).map((tab) => (
            <TabsContent key={tab} value={tab}>
              <AttachmentGrid
                attachments={tab === activeTab ? activeAttachments : []}
                pendingCount={tab === 'unmatched' || tab === 'all' ? pendingCount : 0}
                onCardClick={(att) => pushSheet('inboxAttachment', { attachment: att })}
                onDelete={handleDeleteAttachment}
                onUnlink={handleUnlinkAttachment}
                onExpand={(att) => pushModal('attachmentPreview', { attachment: att })}
                isEmpty={
                  (tab === activeTab ? activeAttachments : []).length === 0 && pendingCount === 0
                }
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  )
}

type GridProps = {
  attachments: InboxAttachment[]
  pendingCount: number
  onCardClick: (att: InboxAttachment) => void
  onDelete: (attachmentId: string) => void
  onUnlink: (attachmentId: string) => void
  onExpand: (att: InboxAttachment) => void
  isEmpty: boolean
}

function AttachmentGrid({
  attachments,
  pendingCount,
  onCardClick,
  onDelete,
  onUnlink,
  onExpand,
  isEmpty,
}: GridProps) {
  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Icon name="inbox" className="size-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No attachments here yet</p>
        <p className="text-xs text-muted-foreground/60">
          Drop files anywhere on this page or use the Upload button
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn('grid gap-3')}
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
    >
      {Array.from({ length: pendingCount }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders have no stable id
        <AttachmentCardSkeleton key={i} />
      ))}
      {attachments.map((att) => (
        <AttachmentCard
          key={att.id}
          attachment={att}
          onClick={() => onCardClick(att)}
          onDelete={() => onDelete(att.id)}
          onUnlink={() => onUnlink(att.id)}
          onExpand={() => onExpand(att)}
        />
      ))}
    </div>
  )
}
