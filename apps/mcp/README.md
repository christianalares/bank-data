# Bank Data finance MCP

Read-only MCP server for searching transactions and invoice attachment metadata without exposing
document bytes or signed storage URLs.

## Configuration

The stdio server requires:

- `DATABASE_URL`: PostgreSQL connection string
- `MCP_OWNER_EMAIL`: existing Bank Data user whose workspace the server may read

The configured user must not be banned and must already own a workspace. The MCP server never
creates a user or workspace.

## Tools

- `get_finance_overview`
- `search_transactions`
- `list_attachments`
- `get_transaction`

All list results are cursor-paginated. Pass the returned `nextCursor` into the next call with the
same filters.

## Run locally

```bash
pnpm --filter @bank-data/mcp build
pnpm --filter @bank-data/mcp start:local
```

Example MCP client configuration after building:

```json
{
  "mcpServers": {
    "bank-data-finance": {
      "command": "pnpm",
      "args": [
        "--dir",
        "/absolute/path/to/bank-data",
        "--filter",
        "@bank-data/mcp",
        "start:local"
      ]
    }
  }
}
```

This is intentionally a local stdio transport. A remote transport requires proper OAuth,
workspace-scoped authorization, rate limiting, and audit logging before it is safe to expose.
