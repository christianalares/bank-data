# Bank Data finance MCP

MCP server for searching transactions, viewing invoice attachments through short-lived signed
links, and managing transaction matches without exposing raw document bytes.

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
- `AWS_S3_BUCKET_NAME`, `AWS_ENDPOINT_URL`, `AWS_DEFAULT_REGION`, `AWS_ACCESS_KEY_ID`, and
  `AWS_SECRET_ACCESS_KEY`: required when creating attachment download URLs

The server reads the app's workspace directly. It never creates a workspace.

## Tools

- `get_finance_overview`
- `search_transactions`
- `list_attachments`
- `get_transaction`
- `get_attachment_image`
- `get_attachment_download_url`
- `link_attachment_to_transaction`
- `approve_suggested_match`
- `dismiss_suggested_match`
- `unlink_attachment`
- `ignore_attachment`

All list results are cursor-paginated. Pass the returned `nextCursor` into the next call with the
same filters.

`get_attachment_image` returns a viewable image inline: PDFs are rendered server-side to a PNG (page
1 by default; pass `page` for others and read `totalPages` from the summary), and image attachments
are returned directly (downscaled when large). It never returns a URL — call
`get_attachment_download_url` only when you explicitly need the original file or a shareable link.
Rendering requires the `AWS_*` storage variables.

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

Replace `Postgres` with the actual Railway database service name.
Copy or reference the five `AWS_*` storage variables used by the web service into the MCP service
to enable signed attachment links.

Generate a public domain for the MCP service, then connect clients to:

```text
https://mcp.example.invalid/mcp
```

Every MCP request must include:

```http
Authorization: Bearer your-token
```

The public health check is available at `/health`. The MCP endpoint validates request hosts and
origins, reads at most 1 MiB per request, bounds concurrent work, and never returns raw file bytes.
Signed download links expire after five minutes and can include the attachment’s storage path.

Static bearer authentication is suitable for this single-user deployment. It is a manually
configured, pre-shared-token mode and intentionally does not advertise OAuth discovery metadata.
