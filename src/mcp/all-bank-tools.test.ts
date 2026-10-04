import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDb } from '#db'

import { createFinanceMcpServer } from './mcp-server'

const originalDatabaseUrl = process.env.DATABASE_URL

afterEach(async () => {
  await closeDb()
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl
  }
})

describe('all-bank MCP scope', () => {
  it('exposes only the three read-only all-bank tools', async () => {
    process.env.DATABASE_URL = 'postgres://local:local@localhost:5432/unused'
    const server = createFinanceMcpServer({ mode: 'all-banks' })
    const client = new Client({ name: 'scope-test', version: '0.1.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
      const result = await client.listTools()
      expect(result.tools.map((tool) => tool.name).sort()).toEqual([
        'list_all_bank_accounts',
        'list_all_bank_transactions',
        'summarize_all_bank_transactions',
      ])
      expect(result.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true)
      expect(
        result.tools.find((tool) => tool.name === 'list_all_bank_transactions')?.inputSchema
          .properties,
      ).toHaveProperty('workspaceKind')
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('exposes only bank reads through the legacy business token', async () => {
    process.env.DATABASE_URL = 'postgres://local:local@localhost:5432/unused'
    const server = createFinanceMcpServer({ mode: 'business' })
    const client = new Client({ name: 'business-scope-test', version: '0.1.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
      const result = await client.listTools()
      expect(result.tools.map((tool) => tool.name).sort()).toEqual([
        'list_bank_accounts',
        'list_bank_transactions',
        'summarize_bank_transactions',
      ])
      expect(result.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true)
    } finally {
      await client.close()
      await server.close()
    }
  })
})
