# Bank Data migration and change gates

This public plan records architecture and acceptance criteria. Private inventories,
production counts, provider consents, deployment identifiers, credentials and
operational acceptance evidence belong outside the repository.

## Architecture

Retain the PostgreSQL bank history, Drizzle schema and migrations, booked bank
imports, a scheduled synchronization process, and authenticated MCP access.
Keep AI, OCR, document interpretation, classification, matching decisions and
payment-status inference outside this service. MCP accepts explicit evidence and
status changes. Payment state remains separate from matching.

The local accounting registers remain authoritative until an explicit verified
cutover. Existing attachment links require reconciliation before they can serve
as current matching evidence. No production migration or payment initiation is
authorized by this document.

## Production change gates

1. Verify the intended project, environment, workspace and database privately.
2. Create a fresh backup and successfully restore it into an isolated database.
3. Rehearse additive migrations and imports there; compare exact identifiers,
   hashes and statuses, and verify rollback and idempotency.
4. Run tests, typecheck, lint, Drizzle checks, build and server smoke checks.
5. Obtain authorization for the specific production change and review its plan.
6. Verify authenticated MCP scopes, complete pagination, source-data preservation
   and scheduled synchronization before accepting a cutover.

Never reset or replace the production database to resolve migration drift.
Use the existing schema and migrations. Preserve protected resources and volume
addresses. The Railway IaC requires private configuration for expected project,
environment and existing volume name; missing values fail closed. Do not apply
placeholder configuration to an existing deployment.

Snapshot-specific maintenance scripts require privately reviewed expectations.
Set their `bank_data.expected_*` PostgreSQL session settings from the reviewed
snapshot before execution; missing settings must abort the operation.

## Public repository privacy acceptance

Scrub all branches and tags, retain their structure, scan reachable history and
commit metadata, and verify the migration branch before force-pushing. Record
only non-private verification results here and in `NOTES.md`. GitHub-managed
pull-request refs and cached objects require separate host-side cleanup.
