import { createHash, timingSafeEqual } from 'node:crypto'

export function getRequiredApiToken() {
  const token = process.env.MCP_API_TOKEN?.trim()

  if (!token) {
    throw new Error('MCP_API_TOKEN is required for HTTP transport')
  }

  if (token.length < 32) {
    throw new Error('MCP_API_TOKEN must contain at least 32 characters')
  }

  return token
}

export function hasValidBearerToken(header: string | string[] | undefined, expectedToken: string) {
  if (typeof header !== 'string') {
    return false
  }

  const match = /^Bearer ([^\s]+)$/i.exec(header.trim())

  if (!match) {
    return false
  }

  return timingSafeEqual(hashToken(match[1]), hashToken(expectedToken))
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest()
}
