import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { and, eq, isNull } from 'drizzle-orm'
import { createDb, personalMcpToken } from '#db'
import { getConsentToken } from '../banking/consent-service'

import {
  getAllBanksToken,
  getBearerToken,
  getRequiredApiToken,
  hashPersonalMcpToken,
  hasValidBearerToken,
} from './bearer-auth'
import { handleBankConsentHttp } from './consent-http'
import { createFinanceMcpServer, type FinanceMcpContext } from './mcp-server'

const MAX_CONTENT_LENGTH_BYTES = 1024 * 1024

export async function startHttpServer() {
  process.env.DATABASE_STATEMENT_TIMEOUT_MS ??= '25000'

  const port = getPort()
  const apiToken = getRequiredApiToken()
  const allBanksToken = getAllBanksToken(apiToken)
  const allowedHosts = getAllowedHosts(port)
  const allowedOrigins = getAllowedOrigins(port)
  const concurrencyLimiter = new ConcurrencyLimiter(getMaxConcurrentRequests())

  const httpServer = createServer(async (request, response) => {
    try {
      await handleRequest({
        request,
        response,
        apiToken,
        allBanksToken,
        allowedHosts,
        allowedOrigins,
        concurrencyLimiter,
      })
    } catch (error) {
      if (request.url?.startsWith('/banking/')) {
        console.error('Bank consent request failed')
      } else {
        console.error(error)
      }

      if (!response.headersSent) {
        sendJson(response, 500, { error: 'Internal server error' })
      } else {
        response.end()
      }
    }
  })

  httpServer.requestTimeout = 30_000
  httpServer.headersTimeout = 10_000

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(port, '0.0.0.0', () => {
      httpServer.off('error', reject)
      resolve()
    })
  })

  console.error(`Hidden Village MCP listening on port ${port}`)

  return {
    close: async () => {
      const forceCloseTimer = setTimeout(() => {
        httpServer.closeAllConnections()
      }, 10_000)
      forceCloseTimer.unref()

      try {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((error) => {
            if (error) {
              reject(error)
              return
            }

            resolve()
          })
        })
      } finally {
        clearTimeout(forceCloseTimer)
      }
    },
  }
}

async function handleRequest({
  request,
  response,
  apiToken,
  allBanksToken,
  allowedHosts,
  allowedOrigins,
  concurrencyLimiter,
}: {
  request: IncomingMessage
  response: ServerResponse
  apiToken: string
  allBanksToken: string | null
  allowedHosts: Set<string>
  allowedOrigins: Set<string>
  concurrencyLimiter: ConcurrencyLimiter
}) {
  const url = new URL(request.url ?? '/', 'http://localhost')

  if (url.pathname === '/health' && request.method === 'GET') {
    sendJson(response, 200, { status: 'ok' })
    return
  }

  if (url.pathname.startsWith('/banking/')) {
    if (!hasAllowedHost(request, allowedHosts)) {
      sendJson(response, 421, { error: 'Misdirected request' })
      return
    }
    await handleBankConsentHttp(request, response, url)
    return
  }

  if (url.pathname !== '/mcp') {
    sendJson(response, 404, { error: 'Not found' })
    return
  }

  if (!hasAllowedHost(request, allowedHosts)) {
    sendJson(response, 421, { error: 'Misdirected request' })
    return
  }

  if (!hasAllowedOrigin(request, allowedOrigins)) {
    sendJson(response, 403, { error: 'Origin not allowed' })
    return
  }

  const authContext = await resolveMcpAuth(request.headers.authorization, apiToken, allBanksToken)
  if (!authContext) {
    response.setHeader('WWW-Authenticate', 'Bearer realm="hidden-village-finance"')
    response.setHeader('Cache-Control', 'no-store')
    sendJson(response, 401, { error: 'Unauthorized' })
    return
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    sendJson(response, 405, { error: 'Method not allowed' })
    return
  }

  if (!concurrencyLimiter.tryAcquire()) {
    response.setHeader('Retry-After', '1')
    sendJson(response, 429, { error: 'Too many concurrent requests' })
    return
  }

  try {
    await processMcpRequest(request, response, authContext)
  } finally {
    concurrencyLimiter.release()
  }
}

async function processMcpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  authContext: FinanceMcpContext,
) {
  let body: Buffer

  try {
    body = await readRequestBody(request)
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      sendJson(response, 413, { error: 'Request body too large' })
      return
    }

    throw error
  }

  const webRequest = new Request(`http://${request.headers.host}${request.url}`, {
    method: 'POST',
    headers: toWebHeaders(request),
    body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
  })
  const mcpServer = createFinanceMcpServer(authContext)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await mcpServer.connect(transport)

  try {
    const webResponse = await transport.handleRequest(webRequest)
    await writeWebResponse(response, webResponse)
  } finally {
    await mcpServer.close()
  }
}

async function resolveMcpAuth(
  authorization: string | string[] | undefined,
  businessToken: string,
  allBanksToken: string | null,
): Promise<FinanceMcpContext | null> {
  const consentToken = process.env.BANK_CONSENT_MCP_TOKEN?.trim()
  if (consentToken && hasValidBearerToken(authorization, getConsentToken())) {
    return { mode: 'consent' }
  }

  if (allBanksToken && hasValidBearerToken(authorization, allBanksToken)) {
    return { mode: 'all-banks' }
  }

  if (hasValidBearerToken(authorization, businessToken)) {
    return { mode: 'business' }
  }

  const token = getBearerToken(authorization)
  if (!token?.startsWith('hv_personal_')) {
    return null
  }

  const db = createDb()
  const stored = await db.query.personalMcpToken.findFirst({
    where: (table, { and, eq, isNull }) =>
      and(eq(table.tokenHash, hashPersonalMcpToken(token)), isNull(table.revokedAt)),
  })

  if (!stored) {
    return null
  }

  const ownerWorkspace = await db.query.workspace.findFirst({
    where: (table, { and, eq }) =>
      and(eq(table.id, stored.workspaceId), eq(table.kind, 'personal')),
    columns: { id: true },
  })
  if (!ownerWorkspace) {
    return null
  }

  await db
    .update(personalMcpToken)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(personalMcpToken.id, stored.id),
        eq(personalMcpToken.tokenHash, hashPersonalMcpToken(token)),
        isNull(personalMcpToken.revokedAt),
      ),
    )

  return {
    mode: 'personal',
    workspaceId: ownerWorkspace.id,
    tokenId: stored.id,
  }
}

function getPort() {
  const value = Number(process.env.PORT ?? 3001)

  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error('PORT must be a valid TCP port')
  }

  return value
}

function getMaxConcurrentRequests() {
  const value = Number(process.env.MCP_MAX_CONCURRENT_REQUESTS ?? 4)

  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error('MCP_MAX_CONCURRENT_REQUESTS must be an integer between 1 and 100')
  }

  return value
}

function getAllowedHosts(port: number) {
  const configuredHosts = process.env.MCP_ALLOWED_HOSTS?.split(',') ?? []
  const hosts = [
    ...configuredHosts,
    process.env.RAILWAY_PUBLIC_DOMAIN,
    `localhost:${port}`,
    `127.0.0.1:${port}`,
  ]

  return new Set(
    hosts.map((host) => host?.trim().toLowerCase()).filter((host): host is string => Boolean(host)),
  )
}

function getAllowedOrigins(port: number) {
  const configuredOrigins = process.env.MCP_ALLOWED_ORIGINS?.split(',') ?? []
  const configuredHosts = process.env.MCP_ALLOWED_HOSTS?.split(',') ?? []
  const origins = [
    ...configuredOrigins,
    ...configuredHosts.map((host) => `https://${host.trim()}`),
    process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN.trim()}`
      : undefined,
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ]

  return new Set(
    origins
      .map((origin) => normalizeOrigin(origin))
      .filter((origin): origin is string => Boolean(origin)),
  )
}

function hasAllowedHost(request: IncomingMessage, allowedHosts: Set<string>) {
  const host = request.headers.host?.toLowerCase()

  return Boolean(host && allowedHosts.has(host))
}

function hasAllowedOrigin(request: IncomingMessage, allowedOrigins: Set<string>) {
  const origin = request.headers.origin

  if (!origin) {
    return true
  }

  return allowedOrigins.has(normalizeOrigin(origin) ?? '')
}

function normalizeOrigin(value: string | undefined) {
  if (!value) {
    return undefined
  }

  try {
    return new URL(value).origin.toLowerCase()
  } catch {
    return undefined
  }
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length

    if (size > MAX_CONTENT_LENGTH_BYTES) {
      throw new RequestBodyTooLargeError()
    }

    chunks.push(buffer)
  }

  return Buffer.concat(chunks)
}

function toWebHeaders(request: IncomingMessage) {
  const headers = new Headers()

  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item)
      }
    } else if (value !== undefined) {
      headers.set(name, value)
    }
  }

  return headers
}

async function writeWebResponse(response: ServerResponse, webResponse: Response) {
  response.statusCode = webResponse.status
  webResponse.headers.forEach((value, name) => {
    response.setHeader(name, value)
  })
  const body = Buffer.from(await webResponse.arrayBuffer())
  response.end(body)
}

function sendJson(response: ServerResponse, statusCode: number, body: Record<string, string>) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.end(JSON.stringify(body))
}

class RequestBodyTooLargeError extends Error {}

class ConcurrencyLimiter {
  private activeRequests = 0

  constructor(private readonly maxConcurrentRequests: number) {}

  tryAcquire() {
    if (this.activeRequests >= this.maxConcurrentRequests) {
      return false
    }

    this.activeRequests += 1
    return true
  }

  release() {
    this.activeRequests = Math.max(0, this.activeRequests - 1)
  }
}
