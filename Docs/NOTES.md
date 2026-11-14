# Public design notes

This file contains reusable design decisions only. Keep bank selections, account
identifiers, balances, transactions, counts, consent state, sync times, deployment
addresses, connection names, credentials and private archive locations outside
this public repository, including commit messages and test fixtures.

## Information layer

- Store explicit records and evidence through Drizzle and MCP. Perform AI,
  document interpretation, classification and matching decisions outside the service.
- Keep payment state independent from transaction matching. Similar names or
  amounts never establish a confirmed match or completed payment.
- Validate workspace scope, exact references, revisions and idempotency. Preserve
  source bank history and immutable change history.
- Keep local accounting registers authoritative until an explicit, verified cutover.

## Bank synchronization

- Import booked transactions; exclude pending provider entries at the boundary.
- Preserve history across renewed consents. Use exact account identity and currency
  for overlap protection; stop on conflicting references.
- Treat provider outages and rate limits separately from integrity failures.
  Preserve the previous successful sync time when a connection fails.
- Use cursor pagination for complete reads and report freshness explicitly.

## Change acceptance

Run the relevant local checks. Before production changes, verify the target,
create a private backup, restore it into an isolated database, rehearse changes,
and compare exact records. Keep operational evidence in a private record.
A successful build or deployment alone does not establish production acceptance.

## Privacy cleanup validation

The migration branch passed 55 enabled tests (four database integration tests
skipped), typecheck, Biome, Drizzle migration checks, the server build, and MCP
health/authentication smoke checks. Private operational notes and payment API
research were removed from public history. Production data and infrastructure
were not accessed or changed by this cleanup.

## Repository consolidation

`main` is the canonical branch for the bank MCP and bookkeeping implementation.
The former web application and task infrastructure are retired. The repository
now uses root package CI checks, PostgreSQL-only local infrastructure, and MCP
documentation aligned with the registered tools and authentication scopes.

Editor-specific rules, the obsolete deployment workflow, unused storage SDK,
bucket/connection retirement scripts and uncalled transfer-matching heuristics
have been removed. Current development and migration rules live in `AGENTS.md`.
Historical database tables, encrypted payloads and the full Drizzle migration
history are retained for data preservation.

The root package passes 55 tests (four isolated-database tests skipped),
typecheck, Biome, Drizzle checks, build and server smoke checks. Repository
consolidation does not establish a register cutover or authorize a live
source-branch change. Operational acceptance evidence remains private.

## Preliminary business bank reads

`list_business_upcoming_payments` reads live PDNG/SCHD source entries separately
from stored booked history. It requires a canonical included account in the
configured business workspace, resolves current consent aliases, and rechecks
access across provider pages. Only business and all-bank read contexts expose it.

The contract preserves decimal strings, source schemes, dates and missing IDs.
It supplies no signing determination or invoice decision. Date filtering uses
value_date; undated entries have an unknown date-range match. Card reservations
are not classified. Pagination limits and provider failures remain distinct from
complete empty reads, and complete API pagination never guarantees full bank
instruction coverage. No schema migration or persistent cache was introduced.

Acceptance: 77 tests passed, four isolated-database tests skipped; typecheck,
Biome, Drizzle checks, build and server smoke checks passed. A bounded live
business-only read through a database connection enforcing read-only queries
validated the output contract and preserved sync timestamps. Private operational
evidence is kept outside the repository. A register cutover is not part of this
capability.

Rollout rehearsal created a fresh backup, restored it into an isolated local
database, and verified exact business record fingerprints. The database-enabled
suite passed 80 tests with one unrelated integration test skipped. Bookkeeping
pagination acceptance now compares exact source identifiers and unchanged bank
record fingerprints instead of assuming fixed snapshot counts. The MCP source
is configured separately from the scheduled sync source so it can follow `main`.

The production rollout passed health and authenticated tool-scope checks. A live
business read passed the output contract. Current Patchbay discovery, definition
and invocation permissions were verified; a subsequent gateway data read was
deferred by an upstream rate limit. Further bank reads were stopped rather than
retrying. Exact business record fingerprints and sync markers remained unchanged.
No schema migration, consent change or scheduled-sync rollout was performed.
Private deployment and provider evidence remains outside this repository.
