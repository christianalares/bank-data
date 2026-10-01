import { createCanvas, loadImage } from '@napi-rs/canvas'
import { pdf } from 'pdf-to-img'

// Rendering PDFs at 2x keeps small receipt text legible without producing
// unnecessarily large payloads.
const PDF_RENDER_SCALE = 2
// Photos of receipts are frequently several megapixels. Cap the long edge so a
// single MCP image response stays small enough for clients to render inline.
const MAX_IMAGE_WIDTH = 1600
// Below this size a raster image is returned untouched to preserve fidelity.
const IMAGE_PASSTHROUGH_MAX_BYTES = 1_500_000
const JPEG_QUALITY = 82

export type RenderedAttachmentImage = {
  data: Buffer
  mimeType: string
  page?: number
  totalPages?: number
}

export async function renderAttachmentImage({
  bytes,
  contentType,
  page,
}: {
  bytes: Buffer
  contentType: string
  page: number
}): Promise<RenderedAttachmentImage> {
  if (contentType === 'application/pdf') {
    return renderPdfPage(bytes, page)
  }

  if (contentType.startsWith('image/')) {
    return normalizeImage(bytes, contentType)
  }

  throw new Error('Attachment cannot be rendered as an image')
}

async function renderPdfPage(bytes: Buffer, page: number): Promise<RenderedAttachmentImage> {
  const document = await pdf(bytes, { scale: PDF_RENDER_SCALE })

  try {
    if (page > document.length) {
      throw new Error('Requested page is out of range')
    }

    const data = await document.getPage(page)

    return {
      data,
      mimeType: 'image/png',
      page,
      totalPages: document.length,
    }
  } finally {
    await document.destroy()
  }
}

async function normalizeImage(
  bytes: Buffer,
  contentType: string,
): Promise<RenderedAttachmentImage> {
  try {
    const image = await loadImage(bytes)
    const scale = image.width > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / image.width : 1

    if (scale === 1 && bytes.length <= IMAGE_PASSTHROUGH_MAX_BYTES) {
      return { data: bytes, mimeType: contentType }
    }

    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0, width, height)

    return { data: await canvas.encode('jpeg', JPEG_QUALITY), mimeType: 'image/jpeg' }
  } catch {
    // Skia could not decode the image (unusual format); return the original
    // bytes so the client can still attempt to display it.
    return { data: bytes, mimeType: contentType }
  }
}
