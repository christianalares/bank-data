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

`list_business_upcoming_payments` provides a separate live read of preliminary
entries, including payments entered for a future date. Discover the canonical
business account ID with the account-list tool in your context, then call:

```json
{
  "accountId": "00000000-0000-4000-8000-000000000001",
  "dateFrom": "2026-01-01",
  "dateTo": "2026-02-01"
}
```

The example identifier and dates are synthetic; supply your selected account
and intended dates. One canonical account and an inclusive range of at most
93 days are required. The configured `BANK_CONSENT_BUSINESS_WORKSPACE_ID` must
identify a business workspace. Only its included accounts with a current,
connected Enable Banking source can be read. Renewed aliases resolve to the
current provider account. Authorization is checked for every provider page and
again before returning results. Personal, consent and bookkeeping-only tokens
do not expose this tool.

The request uses the existing account-transactions endpoint with `strategy=default`
and no status filter. The SEB Sweden connector has rejected `transaction_status=SCHD`;
generic API status support does not establish connector support. The booked
import retains its existing BOOK filter and pending-entry exclusion.

Only source `PDNG` and `SCHD` entries are returned, without changing their status.
Other statuses, including BOOK, cancelled, rejected, unknown and missing statuses,
are excluded and counted in `excludedStatusCounts`. Locally, dates are filtered
only by inclusive `value_date`, reported as `valueDate`. Today is included when
within the requested range. Undated entries supplied by the provider are included
with `dateRangeMatch=unknown`; the provider's own date filtering may still omit
them. Other source dates remain `bookingDate` and `transactionDate`. `valueDate`
is not a separately confirmed execution date. Card reservations are not classified
or removed by heuristics and may appear alongside other preliminary entries.

Each entry includes its canonical account and bank name, source decimal amount
and currency, DBIT/CRDT indicator, creditor and account identifier with the actual
source scheme, reference number and scheme, remittance, source IDs, dates, bank
transaction code, and retrieval timestamp. Missing values remain null. Decimal
precision and signs are preserved verbatim; use the direction indicator rather
than assuming the amount's sign. BBAN is not relabeled Bankgiro. Reference numbers
may be Swedish OCR references; no invoice classification is performed.

Signing information is not supplied by this reading contract:
`signingStatus=not_provided`. Neither PDNG nor a future date proves signing or
payment. IDs are never synthesized, and identical entries are preserved. These
results cannot establish identity across reads when bank IDs are absent. An entry
disappearing establishes no completed, failed, cancelled or unpaid state. Codex
must review explicit evidence before recording any invoice decision.

The service follows continuation keys even after empty pages, keeping other
provider parameters unchanged. Reads stop at 20 pages, 2,000 source entries, or
a 20-second provider-read budget. `retrieval.complete` describes API-page
completion only; `instructionCoverage=not_guaranteed` always applies. Repeated
cursors, bounds, malformed responses and later provider failures return partial
data with `complete=false` and an explicit `incompleteReason`. A failure before
any successful page is an MCP error, never a successful empty list. Access
revocation discards results. `retrievedAt` is the last successful page time;
individual entries carry their page's retrieval time. Pages are not an atomic
bank snapshot. There is no client continuation cursor: after an incomplete
read, review the reason before narrowing the range or retrying.

No preliminary data is persisted or cached, no booked rows or sync timestamps
are changed, and no automatic retries run. These are background provider reads,
so avoid polling: they share the bank's request limits with existing sync.
Rate limits and expired consents remain errors or explicit partial results.

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
