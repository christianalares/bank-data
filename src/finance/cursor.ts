import { z } from 'zod'

const cursorSchema = z.object({
  timestamp: z.string().datetime(),
  id: z.string().uuid(),
})

export type PageCursor = z.infer<typeof cursorSchema>

export function encodeCursor(cursor: PageCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

export function decodeCursor(value: string): PageCursor {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8')
    return cursorSchema.parse(JSON.parse(decoded))
  } catch {
    throw new Error('Invalid pagination cursor')
  }
}
