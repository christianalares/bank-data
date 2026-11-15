# Bank Data MCP

The MCP server exposes stored bank history and explicit company bookkeeping
records. Bank reads are read-only; bookkeeping recording and bank consent use
separate credentials. Document interpretation and matching decisions happen in
Codex, outside this service. See [Bookkeeping](BOOKKEEPING.md) for record and
payment-state contracts.

## Transports and client setup

`src/mcp/index.ts` supports stdio and stateless Streamable HTTP. Set
`MCP_TRANSPORT` to `stdio` or `http`. When unset, `PORT` selects HTTP; otherwise
the server uses stdio. Stdio exposes the business read context, including
bookkeeping lists.

Build and run a local stdio client with:

```bash
pnpm build
pnpm start:mcp:local
```

Example MCP client configuration after building:

```json
{
  "mcpServers": {
    "bank-data": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/to/bank-data", "start:mcp:local"]
    }
  }
}
```

For local HTTP, configure `.env` and run:

```bash
MCP_TRANSPORT=http PORT=3001 pnpm dev:mcp
```

Connect to `http://localhost:3001/mcp` using `Authorization: Bearer <token>`.
`GET /health` is public. Keep remote endpoint URLs and credentials in private
client configuration.

## Configuration

[`.env.example`](../.env.example) lists the current local settings. Database
operations require `DATABASE_URL`. Encrypted personal data requires its original
64-character hex `PERSONAL_DATA_ENCRYPTION_KEY`.

HTTP requires `MCP_API_TOKEN`. Optional `MCP_ALL_BANKS_TOKEN`,
`MCP_BOOKKEEPING_TOKEN`, and `BANK_CONSENT_MCP_TOKEN` select their respective
contexts. Use distinct random values of at least 32 characters. Personal tokens
are checked against non-revoked hashes in `personal_mcp_token` and their personal
workspace; authentication updates their last-used time.

Bookkeeping requires `BANK_CONSENT_BUSINESS_WORKSPACE_ID` to identify an existing
business workspace. Consent also uses `BANK_CONSENT_PERSONAL_WORKSPACE_ID` for
personal access, `BANK_CONSENT_COOKIE_SECRET` for signed browser state, and
`BANK_CONSENT_REDIRECT_ORIGIN` for the `/banking/callback` redirect. Consent and
sync use `ENABLE_BANKING_APPLICATION_ID` and `ENABLE_BANKING_PRIVATE_KEY_BASE64`.
The server does not create workspaces.

HTTP checks hosts and browser origins. Local hosts and the generated Railway
public domain are allowed automatically. Add custom hosts with
`MCP_ALLOWED_HOSTS` and browser origins with `MCP_ALLOWED_ORIGINS` (comma-separated).
The default port is `3001`, authenticated concurrency is `4` via
`MCP_MAX_CONCURRENT_REQUESTS`, and the HTTP database statement deadline defaults
to `25000` ms via `DATABASE_STATEMENT_TIMEOUT_MS`. Request bodies are limited to
1 MiB.

## Tools by credential

| Context | Tools |
| --- | --- |
| Business (`MCP_API_TOKEN` or stdio) | `list_bank_accounts`, `list_bank_transactions`, `summarize_bank_transactions`, `list_business_upcoming_payments`, and the bookkeeping lists below. |
| Personal (stored token) | `list_bank_accounts`, `list_bank_transactions`, `summarize_bank_transactions`, `list_personal_accounts`, `search_personal_transactions`, `summarize_personal_spending`. |
| All banks (`MCP_ALL_BANKS_TOKEN`) | `list_all_bank_accounts`, `list_all_bank_transactions`, `summarize_all_bank_transactions`, `list_business_upcoming_payments`, and the bookkeeping lists below. |
| Bookkeeping (`MCP_BOOKKEEPING_TOKEN`) | All bookkeeping lists and recording tools below. |
| Consent (`BANK_CONSENT_MCP_TOKEN`) | `start_bank_consent`, `get_bank_consent_status`, `recover_bank_selection`. |

Bookkeeping lists:

- `list_bookkeeping_documents`
- `list_bookkeeping_transactions`
- `list_bookkeeping_invoices`
- `list_bookkeeping_history`

Bookkeeping recording tools:

- `record_bookkeeping_document`
- `record_bookkeeping_transaction`
- `record_bookkeeping_invoice`

Personal and consent contexts have no bookkeeping access. Recording tools require
`requestId`, a declared `actor`, and `expectedRevision` (`0` for creation).
Transaction decisions require explicit evidence; payment evidence is required
for states beyond `unknown` and `unpaid`. Identical retries return the original
outcome, while conflicting requests and stale revisions fail. The declared actor
is provenance rather than authenticated identity. Recording does not initiate
payments, upload documents, or send them to an accountant.

## Reading and interpreting results

Stored bank reads return booked transactions from selected accounts. Discover accounts
first when a bank or account is ambiguous. Combined access includes personal
transaction descriptions; keep its credential separate from business-only
access. Use `bankName`, `workspaceKind`, and stable `accountId` filters to keep
banks and accounts distinct. Totals retain original currencies; debits are
negative. Personal search uses indexed text tokens in PostgreSQL.

Follow `nextCursor` with the same filters until pagination is complete. Bank
transaction pages also report `incompletePage`. Connection status and last sync
time describe freshness separately; stored history remains readable after a
bank disconnects and may be incomplete. Personal tool calls record an audit
entry without storing the search query text.

## Preliminary business bank entries

`list_business_upcoming_payments` reads stored preliminary observations for one
selected canonical business account. It never calls the bank, even when data is
missing, stale or a previous refresh failed. Repeated and concurrent reads do
not consume provider requests. Discover business accounts first, then call:

```json
{
  "accountId": "00000000-0000-4000-8000-000000000001",
  "dateFrom": "2026-01-01",
  "dateTo": "2026-02-01"
}
```

The identifier and dates are synthetic. Supply one canonical account and an
inclusive date range of at most 93 days. The configured business workspace must
exist. Every read checks workspace kind, inclusion, current provider alias,
connection ownership and consent validity, then rechecks access before returning.
Connected and transient-error connections can serve observations; disconnected,
expired or excluded sources cannot. Snapshots from a former provider account or
consent are not silently inherited by a renewed source. Business and all-bank
credentials expose this tool; personal, consent and bookkeeping-only credentials
have no new access.

The existing bank sync stores timestamped observation attempts in
`bank_upcoming_snapshot`, separately from booked rows and bookkeeping registers.
It fetches the UTC day of refresh through 92 days ahead with `strategy=default`
and no status filter. The SEB connector has rejected SCHD as a request filter.
Only raw PDNG/SCHD entries within the source value_date window, plus undated
entries, are stored. Other statuses are counted without storing their payloads.
The BOOK request remains separate: an unfiltered future feed has not been
verified as a replacement for full booked-history retrieval. Non-BOOK statuses
are excluded from booked imports; legacy responses without a status retain
existing import behavior.

Each attempt records its actual source account and consent, date window, start
and retrieval times, page completeness, safe failure metadata and ordered entries.
A complete successful snapshot becomes current, including a complete empty one.
Failed and partial attempts remain recorded but never replace the latest complete
snapshot. No payment identity is inferred: identical instructions remain separate
array entries, source IDs remain nullable, and snapshotId identifies a service
observation rather than a bank instruction. No old snapshot disappearance changes
an invoice, payment, match or Gmail state.

Interpret these output fields together:

- `observation.dataAvailable`: whether a complete stored snapshot exists. False
  with entries=[] is unobserved data, not a confirmed empty bank list.
- `observation.dateFrom/dateTo`, `requestedRangeCovered`, `ageSeconds`, and `stale`:
  the snapshot's source window and age. Data is flagged stale after six hours,
  after a failed attempt, or if the requested range is not covered. Daily sync
  observations will therefore often be marked stale between refreshes.
- `retrieval`: the selected complete snapshot's original timestamps and pagination,
  or null when none exists. Serving old data never assigns a new retrieval time.
- `refresh`: workspace refresh start/finish times, latest observation-attempt
  completeness, `lastObservationAttempt` with its dates/pages, safe `failure`,
  `nextAllowedAt`, `blocked`, and `inProgress`.
  The refresh budget and errors are scoped to the workspace; an error can concern
  another connection in that workspace. The timestamp of the observation remains
  account-specific. A running refresh can leave lastAttemptComplete unknown.

Amounts are decimal strings with their source precision and sign. Use
creditDebitIndicator for DBIT/CRDT direction. Names, actual creditor account
schemes, reference/OCR numbers, remittance, bank codes and dates preserve supplied
values; missing fields remain null. BBAN is not relabeled Bankgiro. Date filtering
uses value_date only, exposed as valueDate. Today is included within the requested
range. Undated entries have dateRangeMatch=unknown and may be absent if the bank
omitted them from its own date-filtered response. Card reservations are not
classified or heuristically removed. valueDate is not a confirmed execution date.

Signing remains `not_provided`. PDNG, a future date, and an entry disappearing
prove no signing or payment outcome. `instructionCoverage=not_guaranteed` applies
even to complete API pagination. Codex reviews explicit evidence before recording
any bookkeeping decision.

Provider reads continue after empty cursor pages and stop at 20 pages, 2,000
source entries or a 20-second budget per preliminary read. Malformed responses,
repeated cursors, limits and provider failures produce incomplete attempts. Safe
failure kinds distinguish rate_limited, consent_expired, provider_error,
invalid_response, timeout, network_error, configuration_error,
authorization_changed and incomplete_response. They can include HTTP status, a
validated provider error code and Retry-After seconds, without raw error bodies.
Pages are not an atomic bank snapshot.

The existing sync coordinates background refreshes through PostgreSQL workspace
advisory locks and committed bank_fetch_state rows. The conservative shared
cooldown survives restarts and also applies to explicitly targeted history and
workspace syncs. Network requests verify the lock connection before each page.
A 429 stops remaining requests and advances the deadline by at least six hours,
or longer when Retry-After requests it. The deadline is our earliest permitted
attempt, not a verified bank reset time. No immediate 429 retry occurs. Sync uses
its existing schedule; there is no new polling job or MCP refresh-on-expiry path.
An operator can run the existing sync with `--workspace-id UUID` after the shared
cooldown. No PSU headers or synthetic online-user context are introduced. The
separate consent bootstrap workflow is unchanged.

Source contracts: [Enable Banking transactions and statuses](https://enablebanking.com/docs/api/reference/#get-account-transactions),
[pagination, IDs and background limits](https://enablebanking.com/docs/faq/), and
[SEB Sweden AIS v8 future-event notes](https://github.com/seb-oss/openbanking/blob/master/api-documentation/Account%20Information%20v8%20release%20notes.md).
These sources do not establish signing status or complete payment-instruction coverage.

Bookkeeping results describe explicit recorded decisions. An unregistered
transaction has no review decision. `followupClosed`, matching state, and payment
state are independent. Registered document paths refer to the operator's private
local archive. Use exact identifiers, hashes, and supplied evidence when
reconciling records, following the [production change gates](PLAN.md) before any
schema or register cutover.
