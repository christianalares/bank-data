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

## Preliminary business bank reads

Read preliminary entries from stored observations refreshed by the existing bank
sync. Keep the provider's source status, precision, dates, nullable IDs and
identical instructions separate from booked imports and explicit invoice records.
No payment identity, signing decision, matching or payment outcome is inferred.

Migration `0018_stored_bank_observations` adds only `bank_fetch_state` and
`bank_upcoming_snapshot`, their foreign keys and a source lookup index. It alters
no existing bank or bookkeeping rows. The snapshot stores complete and incomplete
attempts; current reads select only the latest complete result for the currently
authorized source. Complete empty results supersede old observations; incomplete
or failed results never do. The last complete result keeps its original age and
coverage and is served with explicit refresh metadata and safe errors.

The shared PostgreSQL workspace lock serializes syncs across instances. Durable
cooldowns also cover manual workspace/history imports and survive worker failure.
429 responses stop further requests and defer refresh for at least six hours,
respecting a longer Retry-After. This is application policy based on provider
guidance, not a verified account reset time. MCP always reads the database and
never refreshes automatically. Consent bootstrap and active-user PSU support are
separate; no fabricated online-user headers are introduced.

BOOK and upcoming requests remain separate within the coordinated sync, because
the future feed has not been verified as a complete historical booked feed.
The BOOK boundary excludes PDNG, SCHD and other explicit non-BOOK statuses.
The sync uses its existing schedule and observes a 93-day UTC upcoming window.
An explicit initial business refresh can use `--workspace-id UUID` after the
shared cooldown; there is no new polling job.

Local acceptance: generate/review the additive Drizzle migration, apply it to an
isolated restore with `pnpm db:migrate`, run the full quality gates and database
tests, and preserve exact existing business fingerprints. Verify repeated and
concurrent MCP reads with zero network requests, multiple sync connections,
429/backoff, partial pages, complete emptiness, stale coverage and changed access.

The authorized production rollout applied the additive migration before releasing
code. MCP and the existing scheduled sync now follow the same reviewed `main`
source and use the coordinator. A fresh backup was restored, the migration was
rehearsed and safely reapplied, and the prior MCP version passed compatibility
checks against the migrated restore. Existing source record fingerprints remained
unchanged through release acceptance. No infrastructure-wide IaC plan was applied.

A conservative startup cooldown was seeded following the previously documented
rate limit; no bank reset time was inferred or probed. Health, authenticated tool
scopes, exact bookkeeping pagination and current Patchbay stored-read invocation
passed acceptance without additional provider requests. The existing schedule is
retained. No snapshot exists until a permitted sync completes: report
dataAvailable=false and do not promise an immediate first refresh. Retain the
tables if code rollback is needed; never reset or replace production data. Private
backup and deployment evidence remains outside the repository. This is not a
register cutover.

## Repository consolidation

Bring the bank MCP and bookkeeping implementation into `main` with its existing
history. Remove retired editor rules, deployment jobs, environment settings,
storage dependencies and one-off retirement utilities. Keep the existing
Drizzle schema and migration journal intact. Removing repository tooling does
not authorize database changes or a live Railway source-branch change.

Acceptance requires the root package quality gates, server smoke checks, a
frozen-lockfile install, and verification that the migration and bookkeeping
branch tips are included in `main`. Record non-private results in `NOTES.md`.

## Public repository privacy acceptance

Scrub all branches and tags, retain their structure, scan reachable history and
commit metadata, and verify the migration branch before force-pushing. Record
only non-private verification results here and in `NOTES.md`. GitHub-managed
pull-request refs and cached objects require separate host-side cleanup.
