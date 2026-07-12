import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

import { getRequiredApiToken, hasValidBearerToken } from './bearer-auth'
import { createFinanceMcpServer } from './mcp-server'

const MAX_CONTENT_LENGTH_BYTES = 1024 * 1024

export async function startHttpServer() {
  const port = getPort()
  const apiToken = getRequiredApiToken()
  const allowedHosts = getAllowedHosts(port)

  const httpServer = createServer(async (request, response) => {
    try {
      await handleRequest({
        request,
        response,
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
  apiToken,
  allowedHosts,
}: {
  request: IncomingMessage
  response: ServerResponse
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

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    sendJson(response, 405, { error: 'Method not allowed' })
    return
  }

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
  const mcpServer = createFinanceMcpServer()
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
    hosts.map((host) => host?.trim().toLowerCase()).filter((host): host is string => Boolean(host)),
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
