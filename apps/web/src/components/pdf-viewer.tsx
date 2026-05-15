import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'

import { Icon } from '#/components/ui/icon'
import { Skeleton } from '#/components/ui/skeleton'

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

type Props = {
  url: string
  maxWidth?: number
  /** Limit how many pages are rendered. Useful for a small in-context preview. */
  pageLimit?: number
}

export function PdfViewer({ url, maxWidth = 800, pageLimit }: Props) {
  const [numPages, setNumPages] = useState<number>()
  const [loadError, setLoadError] = useState(false)

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full gap-2 text-muted-foreground py-16">
        <Icon name="file" className="size-10 text-muted-foreground/50" />
        <p className="text-sm">Could not load PDF</p>
      </div>
    )
  }

  return (
    <div className="relative w-full overflow-auto bg-muted/30">
      {!numPages && <Skeleton className="absolute inset-0 w-full h-full min-h-64" />}
      <Document
        file={url}
        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
        onLoadError={() => setLoadError(true)}
        loading={null}
      >
        {numPages &&
          Array.from(
            { length: pageLimit ? Math.min(numPages, pageLimit) : numPages },
            (_, index) => {
              const pageNumber = index + 1
              return (
                <Page
                  key={`${url}_page_${pageNumber}`}
                  pageNumber={pageNumber}
                  width={maxWidth}
                  renderAnnotationLayer={false}
                  renderTextLayer={true}
                />
              )
            },
          )}
      </Document>
    </div>
  )
}
