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
  const token = getBearerToken(header)
  if (!token) {
    return false
  }

  return timingSafeEqual(hashToken(token), hashToken(expectedToken))
}

export function getBearerToken(header: string | string[] | undefined) {
  if (typeof header !== 'string') {
    return null
  }

  const match = /^Bearer ([^\s]+)$/i.exec(header.trim())
  return match?.[1] ?? null
}

export function hashPersonalMcpToken(token: string) {
  return createHash('sha256').update(token).digest('base64url')
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest()
}
