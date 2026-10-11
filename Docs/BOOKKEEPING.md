# Bookkeeping information layer

Drizzle and MCP store explicit company records, evidence and audited changes.
The caller performs document interpretation, classification and matching outside
this service. The service does not initiate payments.

## Records and evidence

Documents, transaction reviews, invoice/payment obligations and immutable API
change history use additive tables. Document contents remain in a private local
archive. Preserve hashes, original names, exact source references and sending
status. Registering a document or payment does not send anything.

Payment state is independent of matching: `unknown`, `unpaid`, `scheduled`,
`paid`, `partially_paid`, `cancelled`, `refunded`. Scheduling requires explicit
evidence and the signed payment date. Completion is a separate recorded
transition. Matching requires an exact provider ID and registered document
hashes. Similar names or amounts never establish confirmation.

`followupClosed` remains independent of matching. Historical export IDs must not
invent bank rows. Corrections require the current revision and an audit event.
Reject missing documents, cross-workspace bank references and reuse of documents
across separate confirmed payments. Preserve source bank history.

## MCP scopes

Business and all-bank credentials expose read-only bookkeeping lists for
transactions, invoices, documents and history. Follow cursor pagination.
Unregistered transactions have no bookkeeping decision and must not be assumed
matched or unpaid.

A separate `MCP_BOOKKEEPING_TOKEN` adds explicit document, transaction and invoice
recording. Keep it distinct from bank-read and consent credentials. The server
checks the configured business workspace. Personal and consent contexts have no
bookkeeping access. Mutations require requestId, reported actor, expectedRevision
and evidence. Identical retries return the original outcome; conflicting retries
and stale revisions fail. Actor is declared provenance, not proof of identity.

## Backfill and routine use

Export private local registers with:

```sh
python3 scripts/export-bookkeeper-registers.py <private-register-root> <private-import.json>
pnpm exec tsx scripts/backfill-bookkeeping.ts <private-import.json>
```

Configure the intended business workspace and database outside source control.
The export verifies document hashes. The import is transactional, audited and
idempotent, preserving source fields, aliases, sending state and closed decisions.
Retain local registers and evidence until a separately verified cutover. Read and
reconcile both sources before routine changes; report conflicts explicitly.

## Verification

Follow `PLAN.md` before production schema changes. Run database integration tests
only against an isolated restore, with `BOOKKEEPING_TEST_DATABASE_URL` and
`BOOKKEEPING_TEST_BUSINESS_WORKSPACE_ID` set privately. Tests roll back changes.

`scripts/verify-bookkeeping-import.ts` compares the database with a private
export. `scripts/verify-bookkeeping-mcp.ts` checks complete pagination, credential
scope, retry behavior and revisions. Its endpoint, credentials and import files
are private arguments. Never print private file contents or store operational
acceptance details in this public repository.
