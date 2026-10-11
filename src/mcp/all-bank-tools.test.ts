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
  it.each([
    'bookkeeping',
    'consent',
    'personal',
  ] as const)('isolates the %s tool scope', async (mode) => {
    process.env.DATABASE_URL = 'postgres://local:local@localhost:5432/unused'
    const server = createFinanceMcpServer(
      mode === 'personal'
        ? {
            mode,
            workspaceId: '00000000-0000-4000-8000-000000000001',
            tokenId: '00000000-0000-4000-8000-000000000002',
          }
        : { mode },
    )
    const client = new Client({ name: 'scope-test', version: '0.1.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
      const { tools } = await client.listTools()
      if (mode === 'bookkeeping') {
        expect(tools).toHaveLength(7)
        expect(
          tools
            .filter((t) => t.annotations?.readOnlyHint === false)
            .map((t) => t.name)
            .sort(),
        ).toEqual([
          'record_bookkeeping_document',
          'record_bookkeeping_invoice',
          'record_bookkeeping_transaction',
        ])
      } else {
        expect(tools.some((t) => t.name.includes('bookkeeping'))).toBe(false)
      }
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('adds bookkeeping reads while preserving read-only all-bank access', async () => {
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
        'list_bookkeeping_documents',
        'list_bookkeeping_history',
        'list_bookkeeping_invoices',
        'list_bookkeeping_transactions',
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

  it('keeps the legacy business token read-only', async () => {
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
        'list_bookkeeping_documents',
        'list_bookkeeping_history',
        'list_bookkeeping_invoices',
        'list_bookkeeping_transactions',
        'summarize_bank_transactions',
      ])
      expect(result.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true)
    } finally {
      await client.close()
      await server.close()
    }
  })
})
