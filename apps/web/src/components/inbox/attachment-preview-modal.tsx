import { popModal } from '#/components/modals'
import { PdfViewer } from '#/components/pdf-viewer'
import { Button } from '#/components/ui/button'
import { DialogClose, DialogContent } from '#/components/ui/dialog'
import { Icon } from '#/components/ui/icon'

export type PreviewAttachment = {
  contentType: string
  signedUrl: string
  filename: string
}

type Props = {
  attachment: PreviewAttachment
}

export function AttachmentPreviewModal({ attachment }: Props) {
  const isImage = attachment.contentType.startsWith('image/')

  return (
    <DialogContent className="max-w-3xl w-full p-0 overflow-hidden">
      <div className="relative">
        <DialogClose asChild>
          <Button
            size="icon"
            variant="secondary"
            className="absolute right-3 top-3 z-10 size-8"
            onClick={() => popModal('attachmentPreview')}
          >
            <Icon name="x" className="size-4" />
          </Button>
        </DialogClose>

        {isImage ? (
          <img
            src={attachment.signedUrl}
            alt={attachment.filename}
            className="max-h-[85vh] w-full object-contain"
          />
        ) : attachment.contentType === 'application/pdf' ? (
          <div className="max-h-[85vh] overflow-auto">
            <PdfViewer url={attachment.signedUrl} maxWidth={720} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 py-20 px-8">
            <p className="text-sm text-muted-foreground text-center">{attachment.filename}</p>
            <Button asChild variant="outline" size="sm">
              <a href={attachment.signedUrl} target="_blank" rel="noreferrer">
                Open file
              </a>
            </Button>
          </div>
        )}
      </div>
    </DialogContent>
  )
}
