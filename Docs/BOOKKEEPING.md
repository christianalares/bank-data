# Bookkeeping information layer

Christian authorized implementation, complete match backfill, commit/push and
production deployment on 2026-10-11. Railway stores explicit company records
through Drizzle and MCP. Codex supplies decisions and evidence; this service
contains no AI, document extraction, matching heuristics, Gmail ingestion or UI.
It does not initiate payments.

## Records and evidence

Four additive tables store local document metadata, transaction reviews,
invoice/payment obligations and immutable API change history. Document contents
remain in Bookkeeper OS. Hashes, original names, exact source references and sent
status are preserved. The local utskickslogg remains the canonical evidence of
actual sending; registering a document or payment does not send anything.

Payment state is independent of matching: `unknown`, `unpaid`, `scheduled`,
`paid`, `partially_paid`, `cancelled`, `refunded`. Signed scheduling requires an
explicit source and payment date; it cannot claim a completed bank transaction.
A Christian confirmation identifies the exact invoice/amount and signed payment
date. A later completed payment is a separate recorded transition. Bank matching
requires an explicit provider ID and confirmed registered document hashes.
An invoice view is confirmed only when all explicitly linked review records are
confirmed. Delayed matching does not alter payment state or Gmail labels.

Existing `followupClosed` decisions remain separate from actual matching state.
34 provisional historical export IDs have no invented bank row. Actual bank dates
come from source booking_date; backfill preserves the verified CSV dates.
Corrections require the current revision and an audit event. The API rejects
missing documents, mismatched business bank rows and document reuse across
separate confirmed payments. No API changes or deletes source bank history.

## MCP scopes

The business and all-bank read credentials gain four read-only tools:
`list_bookkeeping_transactions`, `list_bookkeeping_invoices`,
`list_bookkeeping_documents`, `list_bookkeeping_history`. Each is cursor paged.
Transaction reads accept inclusive bank dates, match state and closed filtering;
invoice reads accept payment state. Unregistered bank transactions have no
bookkeeping decision and must not be assumed matched or unpaid.

A separate `MCP_BOOKKEEPING_TOKEN` exposes those reads plus
`record_bookkeeping_document`, `record_bookkeeping_transaction`, and
`record_bookkeeping_invoice`. It must be distinct from bank-read and consent
credentials. The workspace is the configured business workspace, checked server
side, and cannot be supplied by a caller. Personal and consent MCP contexts have
no bookkeeping access. Mutations require requestId, reported actor,
expectedRevision (0 to create) and appropriate evidence. Equal retries return the
original outcome; reuse with different content and stale versions are rejected.
Actor is declared provenance, not cryptographic proof of who reviewed a document.

## Backfill and routine use

Export the canonical local registers with
`python3 scripts/export-bookkeeper-registers.py --root <bookkeeper-os> --output <private-import.json>`.
Every file is checked against its SHA-256. Import using
`pnpm exec tsx scripts/backfill-bookkeeping.ts <private-import.json>` with an
explicit business workspace and DATABASE_URL. The import is transactional,
audited and idempotent. It preserves all original CSV fields, ID aliases, sending
state and closed decisions. Explicit reviewed invoice decisions are read from
`docs/metadata/bookkeeping-invoices-2026-10-11.json` when present.

This initial import mirrors the canonical local transaction/document registers;
those registers and local evidence are retained. Routine Codex work must read
both current MCP state and local registers before a change, record the explicit
decision through MCP, and reconcile the local registers. A conflict must be
reported, not silently overwritten. Backfill is not an ongoing synchronization
job and will reject changed payloads under its initial request IDs.

## Verification

Before production schema changes, restore the private Postgres dump into an
isolated PostgreSQL 18 cluster and rehearse the additive migrations and import.
`BOOKKEEPING_TEST_DATABASE_URL=<isolated-restore> pnpm test` runs transactionally
rolled-back integration checks. Never use production for that test fixture.
Run typecheck, Biome, Drizzle check, build and server smoke checks. Verify the
actual deployed MCP tool catalog and read every import page, compare all exact
keys/hashes/statuses with the local export, replay an identical mutation and
check original bank IDs/counts remain unchanged. Store acceptance evidence in
PLAN.md and NOTES.md and the Bookkeeper OS migration report.
