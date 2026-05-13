import { FileIcon, XIcon } from 'lucide-react'
import type { InboxAttachment } from '#/components/inbox/attachment-card'
import { Button } from '#/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '#/components/ui/dialog'

type Props = {
  attachment: InboxAttachment | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AttachmentPreviewModal({ attachment, open, onOpenChange }: Props) {
  if (!attachment) {
    return null
  }

  const isImage = attachment.contentType.startsWith('image/')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden">
        <div className="relative">
          <DialogClose asChild>
            <Button size="icon" variant="secondary" className="absolute right-3 top-3 z-10 size-8">
              <XIcon className="size-4" />
            </Button>
          </DialogClose>

          {isImage ? (
            <img
              src={attachment.signedUrl}
              alt={attachment.filename}
              className="max-h-[85vh] w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 py-20 px-8">
              <FileIcon className="size-16 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground text-center">{attachment.filename}</p>
              <Button asChild variant="outline" size="sm">
                <a href={attachment.signedUrl} target="_blank" rel="noreferrer">
                  Open PDF
                </a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
