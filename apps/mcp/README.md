# Bank Data finance MCP

Read-only MCP server for searching transactions and invoice attachment metadata without exposing
document bytes or signed storage URLs.

## Configuration

Both transports require:

- `DATABASE_URL`: PostgreSQL connection string

The HTTP transport also requires:

- `MCP_API_TOKEN`: random bearer token with at least 32 characters
- `PORT`: HTTP port; Railway provides this automatically
- `MCP_ALLOWED_HOSTS`: optional comma-separated custom domains; Railway's generated public domain
  is allowed automatically
- `MCP_ALLOWED_ORIGINS`: optional comma-separated serialized origins for browser-based clients
- `MCP_MAX_CONCURRENT_REQUESTS`: bounded authenticated request concurrency; defaults to `4`
- `DATABASE_STATEMENT_TIMEOUT_MS`: PostgreSQL statement deadline; HTTP mode defaults to `25000`

The server reads the app's workspace directly. It never creates a workspace.

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

## Deploy a separate Railway service

Create a new service from the same repository. Keep its root directory at `/` and set its Railway
config file path to `/apps/mcp/railway.toml`.

Configure these service variables:

```dotenv
DATABASE_URL=${{Postgres.DATABASE_URL}}
MCP_API_TOKEN=replace-with-a-random-32-character-or-longer-secret
MCP_TRANSPORT=http
DATABASE_STATEMENT_TIMEOUT_MS=25000
```

Replace `Postgres` with the actual Railway database service name. Generate a public domain for the
MCP service, then connect clients to:

```text
https://mcp.example.invalid/mcp
```

Every MCP request must include:

```http
Authorization: Bearer your-token
```

The public health check is available at `/health`. The MCP endpoint validates request hosts and
origins, reads at most 1 MiB per request, bounds concurrent work, and returns no storage keys,
signed URLs, or file bytes.

Static bearer authentication is suitable for this single-user, read-only deployment. Replace it
with OAuth before supporting multiple users or write tools. It is a manually configured
pre-shared-token mode and intentionally does not advertise OAuth discovery metadata.
