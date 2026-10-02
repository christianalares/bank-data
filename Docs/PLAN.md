# Hidden Village bank MCP migration

Status: planning. Working branch: `codex/bank-mcp-migration`.

## Goal

Keep a small, reliable, read-only bank data service. Hidden Village retains its
Postgres transaction history, Drizzle schema and migrations, Enable Banking
connection, scheduled import, and MCP access. ChatGPT through Executor handles
reasoning, invoice discovery, and instructions for where to search. Executor runs
on the user's other machine and can use its own email, browser, computer, and
file connections. Hidden Village does not need to import invoices or make
matching decisions.

The intended Railway resources are the existing Postgres database, an HTTP MCP
service, and a short-lived scheduled bank sync process. Both processes may use
one application package with separate start commands. Define the resources in
`.railway/railway.ts` after importing and reviewing the live Railway state.

## Decisions

- Bank access is for reading accounts, balances, and transactions. Do not add
  payment or transfer initiation.
- Persist booked transactions in Postgres. Preserve the existing database and
  Drizzle migration history; do not rebuild or replace the database.
- Only booked transactions belong in the spending ledger. Preserve the existing
  `BOOK` request plus `PDNG` exclusion at the provider boundary. Check the
  existing database for older pending rows before any cleanup.
- Let Executor retrieve relevant complete transaction sets through account and
  date filters with cursor pagination. ChatGPT does the interpretation. Do not
  require semantic search, invoice matching, or finance prompts in this codebase.
- Bank consent can start through a restricted MCP operation that returns the
  Enable Banking authorization URL. The user completes bank consent in a
  browser; a minimal callback on Railway completes the session. No terminal
  command or full web app is required.
- Use Biome for formatting and linting. Keep the useful Kodiak Platform
  readability rules: clear logical groups, single blank lines between steps,
  braces for control flow, and explicit block returns for multiline arrows.
  TanStack, route, UI, and `stian` branch rules do not apply here.
- Keep this branch for the migration and related Raycast work. Make no production
  cutover or deletion until the new path has been verified end to end.

## Task ledger

Status values: `pending`, `in progress`, `done`, `blocked`. Update this table and
`NOTES.md` as work advances. Each task should leave evidence that another agent
can inspect.

| ID | Status | Task and acceptance evidence |
| --- | --- | --- |
| 01 | done | Live Railway and read-only database inventory recorded in `NOTES.md` on 2026-10-01. Service IDs, deployment/configuration state, anonymized row counts, booked date bounds, and live Drizzle version are verified. No usable backup or restore point was verified; this blocks later production changes until resolved. |
| 02 | done | Read-only comparison recorded in `NOTES.md` on 2026-10-01. One personal account is excluded, four connections are disconnected (one retains 128 booked rows), no pending rows or repeated provider transaction keys were found, and one booked pair needs private review as a possible duplicate. Cleanup is proposed separately; no production rows changed. |
| 03 | done | Imported all five live Railway resources into `.railway/railway.ts` and recorded their verified IDs in `NOTES.md` on 2026-10-01. The production plan reported `No changes`, zero actions and diagnostics, and no staged patch. Postgres service `404f6fb9-da37-403f-b1f3-e8d6e2c54d60` and its existing volume remain in the plan. No apply was run; a usable backup and tested restore remain required before any production-changing apply. |
| 04 | done | One root application package now has `src/mcp`, `src/banking`, and `src/db`, with separate MCP and sync entry points. All 31 Drizzle files match the previous revision byte for byte. Root build, 18 tests, typechecks, Biome, an MCP smoke test, and a fresh local Postgres migration with 15 journal rows passed. See `NOTES.md` for limits and deployment gates. |
| 05 | blocked | The mobile form and idempotent callback fixes are deployed. A new Vivaldi authorization completed, but a second callback returned 400. The same Vivaldi browser then lacked the selection cookie, although the pending consent and one account remain valid in the database and provider. Both old personal connections remain active. A restricted, signed recovery link for this already completed consent passed local integration and awaits deployment. Live account selection and renewal remain unverified. See `NOTES.md`. |
| 06 | pending | Move bank sync from Trigger.dev to a Railway cron process. Preserve pagination, booked-only filtering, stable IDs, upserts, balances, retries, transient failure handling, and consent-expiry status. Ensure the process exits after each run and reports its last success. |
| 07 | pending | Expose read-only MCP tools for every selected personal and company account. Support account/date filters and cursor pagination, and report data freshness and incomplete pages. Ensure results and totals use booked transactions only. Verify authorization limits and audit logging. |
| 08 | pending | Connect Executor and update Raycast configuration as needed. Test actual authenticated tool calls from the user’s intended devices and a complete multi-page transaction retrieval. Do not infer success from a connection record alone. |
| 09 | pending | Compare new and old bank results for bounded account/date windows, including amounts, counts, and currencies. Verify the cron, consent renewal, backup and restore, and first unattended Executor workflow. |
| 10 | pending | After acceptance, retire the old web service, Trigger.dev jobs, Cloudflare personal search worker, obsolete storage/invoice code, and unused Railway resources. Review every deletion and infrastructure plan against the live database before applying it. |

## Cutover rules

1. Preserve the Railway Postgres service and its data throughout the migration.
   Take or verify a usable backup and restore procedure before changing schema
   or deploying the new sync.
2. Keep the old import path available until the new sync proves equivalent on
   selected account/date windows. Avoid concurrent import jobs during cutover.
3. Never treat a passing build, Railway deployment, MCP connection record, or
   OAuth approval as proof of complete bank data. Verify an actual bank tool
   call and compare database results.
4. Make cleanup the last step. The `railway.ts` plan must show exactly what will
   happen to every existing service, especially Postgres.

## Out of scope

- Payment initiation or transfers.
- Invoice extraction, automatic invoice matching, Gmail ingestion, and custom
  AI prompts in Hidden Village. Executor and ChatGPT own those workflows.
- Rebuilding the database from provider history. Enable Banking history can be
  limited after authorization, so the existing database is the archive.

## Source pointers

- Current MCP: `src/mcp/`, `railway.mcp.toml`.
- Provider client and booked-only filter: `src/banking/index.ts`.
- Current bank cron and import: `src/jobs/tasks/sync-banking.ts`; standalone
  entry point: `src/sync/index.ts`.
- Drizzle schema and migrations: `src/db/`, `drizzle/`.
- Personal MCP paging: `src/finance/personal-schemas.ts` and
  `src/finance/personal-service.ts`.
- Current consent callback: `apps/web/src/routes/api/banking/enable-banking/callback.ts`.
- Kodiak conventions: `/Users/christian/dev/kodiak/kodiak-platform/AGENTS.md`,
  `biome.json`, and `.railway/railway.ts`.

See `NOTES.md` for verified observations and the next safe step.
