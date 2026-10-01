# Hidden Village finance MCP

MCP server for searching transactions, viewing invoice attachments through short-lived signed
links, and managing transaction matches without exposing raw document bytes.

## Configuration

Both transports require:

- `DATABASE_URL`: PostgreSQL connection string
- `PERSONAL_DATA_ENCRYPTION_KEY`: the same 64-character hex key used by the web and jobs services
- `PERSONAL_SEARCH_SERVICE_URL` and `PERSONAL_SEARCH_API_TOKEN`: the isolated Cloudflare
  Workers AI + Vectorize search service

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

Personal MCP tokens created under **Personal > Connections** expose only these read-only tools:

- `list_personal_accounts`
- `search_personal_transactions`
- `summarize_personal_spending`

They never expose IBANs, raw provider payloads, invoice tools, or mutation tools. Every personal tool
call is recorded in the MCP access log without storing the text of the user’s search query.

All list results are cursor-paginated. Pass the returned `nextCursor` into the next call with the
same filters.

`get_attachment_image` returns a Markdown image link (`![...](signed-url)`) in a single `text` block
so clients that only render Markdown (e.g. Raycast) display it inline; callers should paste that
Markdown into their reply. It does not return a native MCP `image` content block. PDFs are rendered
server-side to a PNG (page 1 by default; pass `page` for others) and cached under
`previews/<attachmentId>/page-N.png`, so repeat views reuse the cached PNG instead of re-rendering;
image attachments are already viewable files, so their preview URL points straight at the original
with no render, download, or upload. Signed preview URLs expire after one hour. Use
`get_attachment_download_url` for the original file or a shareable download link. Both tools require
the `AWS_*` storage variables.

## Run locally

```bash
pnpm build:server
pnpm start:mcp:local
```

Example MCP client configuration after building:

```json
{
  "mcpServers": {
    "hidden-village-finance": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/to/hidden-village", "start:mcp:local"]
    }
  }
}
```

The public health check is available at `/health`. The MCP endpoint validates request hosts and
origins, reads at most 1 MiB per request, bounds concurrent work, and never returns raw file bytes.
Signed download links expire after five minutes and can include the attachment's storage path.

The legacy Railway services have not been switched to the root package commands. Their current
configuration in `.railway/railway.ts` is retained for review. Production deployment and database
migration require the backup and restore gate in `Docs/PLAN.md` first.
