# Bank Data

Bank Data stores personal and business bank history and company bookkeeping
records in PostgreSQL, and exposes them through the Model Context Protocol (MCP).
Codex uses these records through chat to answer financial questions and record
explicit bookkeeping decisions.

## What it does

- Syncs booked transactions and balances from selected accounts through Enable
  Banking, preserving stored history across consent renewals.
- Provides scoped account lists, paginated transaction reads, and deterministic
  totals for personal, business, or combined bank access. Reads report connection
  status and sync freshness separately from transaction history.
- Starts and renews read-only bank consent through a separate MCP credential,
  with browser authorization and account selection.
- Stores document metadata, transaction reviews, invoice/payment records,
  supporting evidence, and immutable before/after change history. A separate
  bookkeeping credential permits explicit, audited writes.

## Responsibility boundary

Codex performs AI reasoning, OCR, document interpretation, classification,
matching decisions, and payment-status inference outside this service. Bank Data
validates and stores the supplied records, exact references, evidence, and status
changes. It enforces workspace scope, revisions, referential integrity, and
idempotent retries.

Payment state and transaction matching are independent. A scheduled payment
requires explicit evidence and a signed payment date; recording its completion
is a separate change. Similar names or amounts never establish a confirmed match
or completed payment. Recording an invoice or payment decision does not initiate
a payment.

Document contents remain in a private local archive; the bookkeeping register
stores hashes, paths, original filenames, and source references. Local accounting
registers remain authoritative until an explicit, verified cutover. Legacy
attachment links require reconciliation before use as current matching evidence.
Chat and MCP are the primary interface; a transaction UI is deferred.

See [Bookkeeping](Docs/BOOKKEEPING.md) for record contracts, backfill, and
verification, and [Design notes](Docs/NOTES.md) for the architecture decisions.

## MCP access

The HTTP server exposes different tools according to the bearer credential:

| Credential | Access |
| --- | --- |
| `MCP_API_TOKEN` | Business bank reads (`list_bank_accounts`, `list_bank_transactions`, `summarize_bank_transactions`) and bookkeeping lists. |
| Stored personal token | Workspace-scoped bank reads, personal transaction search, and spending summaries. |
| `MCP_ALL_BANKS_TOKEN` | Selected personal and business accounts through `list_all_bank_accounts`, `list_all_bank_transactions`, and `summarize_all_bank_transactions`, plus bookkeeping lists. |
| `MCP_BOOKKEEPING_TOKEN` | Bookkeeping lists and `record_bookkeeping_document`, `record_bookkeeping_invoice`, and `record_bookkeeping_transaction`. |
| `BANK_CONSENT_MCP_TOKEN` | `start_bank_consent`, `get_bank_consent_status`, and `recover_bank_selection`. |

Keep the configured credentials distinct and at least 32 characters long.
Personal and consent contexts have no bookkeeping access. Bookkeeping writes
require a request ID, declared actor, and expected revision. Transaction reviews
require evidence; payment states beyond `unknown` and `unpaid` require payment
evidence. Identical retries return the original result, while conflicting retries
and stale revisions fail. The actor records caller-supplied provenance.

Follow each paginated result's `nextCursor` with the same filters. For combined
bank reads, distinguish bank, workspace, account, and original currency when
presenting results. Stored history may be incomplete even when a read succeeds.

## Local Development

The build targets Node.js 22. Use pnpm 9.15.4 (pinned in `package.json`) and Docker
Compose for local PostgreSQL. For a new checkout:

```bash
pnpm install
cp -f .env.example .env
```

Edit `.env` before starting. Keep `DATABASE_URL` pointed at the intended local
database. The example uses PostgreSQL on port `5433` to avoid colliding with a
machine-level PostgreSQL on port `5432`.

Configure the settings needed for the features you use:

- `DATABASE_URL` for database operations.
- `PERSONAL_DATA_ENCRYPTION_KEY`, a 64-character hex key, for encrypted personal
  data. Reading existing data requires the same key used when it was stored.
- `MCP_API_TOKEN` for HTTP transport; the other MCP credentials enable their
  respective scopes.
- `BANK_CONSENT_BUSINESS_WORKSPACE_ID`, an existing business workspace UUID, for
  bookkeeping and business consent. Personal consent also uses
  `BANK_CONSENT_PERSONAL_WORKSPACE_ID`.
- `ENABLE_BANKING_APPLICATION_ID` and `ENABLE_BANKING_PRIVATE_KEY_BASE64` for
  provider access during bank sync and consent.
- `BANK_CONSENT_COOKIE_SECRET` and `BANK_CONSENT_REDIRECT_ORIGIN` for browser
  consent. Use a separate random cookie secret of at least 32 characters.

Then prepare the local schema and start the server:

```bash
pnpm dev:infra
pnpm db:migrate
pnpm dev
```

`pnpm dev` starts local PostgreSQL and the MCP server. Without `PORT`, MCP uses
stdio and exposes the business read context. Set `MCP_TRANSPORT=stdio` to select
it explicitly. Workspaces and selected bank accounts must already exist for bank
reads; migrations alone do not provision them.

For local HTTP access:

```bash
MCP_TRANSPORT=http PORT=3001 pnpm dev:mcp
```

Connect clients to `http://localhost:3001/mcp` with the appropriate bearer token.
The public health endpoint is `http://localhost:3001/health`. HTTP mode is also
selected automatically when `PORT` is set. Custom domains and browser origins
use `MCP_ALLOWED_HOSTS` and `MCP_ALLOWED_ORIGINS`.

## Commands and source layout

| Command | Purpose |
| --- | --- |
| `pnpm build` | Build `dist/mcp.js` and `dist/sync.js`. |
| `pnpm start:mcp` | Run the built MCP server with the process environment. |
| `pnpm start:mcp:local` | Run the built MCP server with `.env`. |
| `pnpm start:sync` | Run one bank sync and exit; accepts `--account-id UUID`. Uses the process environment. |
| `pnpm test` | Run the Vitest suite. |
| `pnpm typecheck` | Check TypeScript types. |
| `pnpm check` | Run Biome formatting and lint checks. |
| `pnpm db:check` | Check Drizzle migration consistency. |
| `pnpm test:smoke` | Check the built HTTP health endpoint, bearer guard, and sync entry point. Run after building. |

Bookkeeping database integration tests are opt-in. Use an isolated restore and
privately configure `BOOKKEEPING_TEST_DATABASE_URL` and
`BOOKKEEPING_TEST_BUSINESS_WORKSPACE_ID` as described in
[Bookkeeping verification](Docs/BOOKKEEPING.md#verification).

This repository is one TypeScript/pnpm application package:

| Path | Responsibility |
| --- | --- |
| `src/mcp/` | MCP tools, scoped authentication, HTTP/stdio entry point, and consent HTTP routes. |
| `src/banking/` | Enable Banking client and consent management. |
| `src/sync/` | Booked transaction import and the one-shot sync entry point. |
| `src/finance/` | Scoped bank reads, personal search, spending summaries, and cursor pagination. |
| `src/bookkeeping/` | Explicit bookkeeping records, validation, audit history, and MCP tools. |
| `src/db/` and `drizzle/` | PostgreSQL access, personal data encryption, schema, and migration history. |
| `scripts/` | Register export, backfill, verification, and operational utilities. |

## Deployment and database changes

`railway.mcp.toml` builds and starts the MCP service with a `/health` check.
`.railway/railway.ts` defines the existing PostgreSQL service and protected
volume, MCP service, and scheduled bank sync. The application service definitions
track `codex/bank-mcp-migration`.

`pnpm db:migrate` targets the `DATABASE_URL` in the local `.env` file.
`pnpm db:migrate:prod` uses the process environment and must only be run after
verifying the target and following the [production change gates](Docs/PLAN.md).

Production changes require a fresh backup, a successful isolated restore,
rehearsal and acceptance checks, and authorization for the specific change.
Preserve the existing database and migration history. Keep credentials, bank
data, deployment identifiers, archive locations, and operational acceptance
evidence outside this public repository.
