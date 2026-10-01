# Migration notes and handoff

Updated: 2026-10-01. Branch: `codex/bank-mcp-migration`.

## Verified so far

- The branch was created from clean `main` at commit `6b40750`. No application,
  database, Railway, Raycast, or provider changes have been made in this branch.
- `railway list --json` showed a `hidden-village` project with one `production`
  environment and three named services: `Postgres`, `mcp`, and `web`. This is
  resource inventory only. Deployment health, variables, schema state, row
  counts, backup status, and actual MCP calls remain unverified.
- `railway status` without an explicit project failed because this checkout is
  not linked to a Railway project. Use explicit project/environment selection
  for read-only inspection. A detailed status call was interrupted before its
  result was read; do not infer anything from it.
- `bd prime` could not run because `bd` is not installed on this host. The user
  expressly requested the working plan and task ledger in `Docs/` so future
  agents can pick up one slice at a time.
- The repository already uses Drizzle and has migrations `0000` through `0014`.
  Their continuity must be verified against the live database before changes.
- The provider client asks Enable Banking for `transaction_status=BOOK` and
  filters any returned `PDNG` rows. Both connect-time and scheduled imports use
  that client. The personal MCP query currently has no explicit booked-status
  condition, so legacy pending rows could still appear if present.
- Personal transaction reads already accept account and date filters and use
  cursor pagination, with a maximum of 200 rows per call.

## Open questions to resolve from evidence

- Which personal and business bank accounts are connected, included, and fully
  imported? Do not write identifiers or transaction details into this document.
- Does Postgres contain old pending rows or duplicate booked rows? Compare
  counts and safe aggregates before proposing any correction.
- What is the current Railway deployment state and backup/restore path? Confirm
  that the IaC resource identity refers to the existing database.
- What MCP connection and authentication arrangement does Executor actually
  use, and what needs to change in Raycast? Verify on the real machines later.
- Which provider and browser redirect URLs are currently registered for bank
  consent? Preserve a working callback through migration.

## Next safe step

Perform task 01 in `PLAN.md` using read-only Railway and database inspection.
Record aggregate evidence here. Do not apply infrastructure changes or remove
the current web app while the database and consent path are unverified.
