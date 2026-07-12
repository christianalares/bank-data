import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import { getRequiredApiToken, hasValidBearerToken } from './bearer-auth'
import { createFinanceMcpServer } from './mcp-server'

const MAX_CONTENT_LENGTH_BYTES = 1024 * 1024

export async function startHttpServer() {
  const port = getPort()
  const apiToken = getRequiredApiToken()
  const allowedHosts = getAllowedHosts(port)
  const mcpServer = createFinanceMcpServer()
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await mcpServer.connect(transport)

  const httpServer = createServer(async (request, response) => {
    try {
      await handleRequest({
        request,
        response,
        transport,
        apiToken,
        allowedHosts,
      })
    } catch (error) {
      console.error(error)

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

  console.error(`Bank Data MCP listening on port ${port}`)

  return {
    close: async () => {
      await transport.close()
      await mcpServer.close()
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      })
    },
  }
}

async function handleRequest({
  request,
  response,
  transport,
  apiToken,
  allowedHosts,
}: {
  request: IncomingMessage
  response: ServerResponse
  transport: StreamableHTTPServerTransport
  apiToken: string
  allowedHosts: Set<string>
}) {
  const url = new URL(request.url ?? '/', 'http://localhost')

  if (url.pathname === '/health' && request.method === 'GET') {
    sendJson(response, 200, { status: 'ok' })
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

  if (!hasValidBearerToken(request.headers.authorization, apiToken)) {
    response.setHeader('WWW-Authenticate', 'Bearer realm="bank-data-finance"')
    response.setHeader('Cache-Control', 'no-store')
    sendJson(response, 401, { error: 'Unauthorized' })
    return
  }

  const contentLength = Number(request.headers['content-length'] ?? 0)

  if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH_BYTES) {
    sendJson(response, 413, { error: 'Request body too large' })
    return
  }

  await transport.handleRequest(request, response)
}

function getPort() {
  const value = Number(process.env.PORT ?? 3001)

  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error('PORT must be a valid TCP port')
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
    hosts
      .map((host) => host?.trim().toLowerCase())
      .filter((host): host is string => Boolean(host)),
  )
}

function hasAllowedHost(request: IncomingMessage, allowedHosts: Set<string>) {
  const host = request.headers.host?.toLowerCase()

  if (!host || !allowedHosts.has(host)) {
    return false
  }

  const origin = request.headers.origin

  if (!origin) {
    return true
  }

  try {
    return allowedHosts.has(new URL(origin).host.toLowerCase())
  } catch {
    return false
  }
}

function sendJson(response: ServerResponse, statusCode: number, body: Record<string, string>) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.end(JSON.stringify(body))
}
