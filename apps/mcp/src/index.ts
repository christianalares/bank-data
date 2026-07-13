import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { startHttpServer } from './http-server'
import { createFinanceMcpServer } from './mcp-server'

async function main() {
  if (getTransportMode() === 'http') {
    const httpServer = await startHttpServer()

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, async () => {
        await httpServer.close()
        process.exit(0)
      })
    }

    return
  }

  const server = createFinanceMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

function getTransportMode() {
  const mode = process.env.MCP_TRANSPORT?.trim().toLowerCase()

  if (!mode) {
    return process.env.PORT ? 'http' : 'stdio'
  }

  if (mode !== 'http' && mode !== 'stdio') {
    throw new Error('MCP_TRANSPORT must be either "http" or "stdio"')
  }

  return mode
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
