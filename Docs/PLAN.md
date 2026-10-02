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
| 05 | done | A real personal Nordea renewal completed through the restricted MCP initiation, provider callback, signed recovery selection, and phone Save. The new connection is connected with one selected account, the intended old connection is disconnected, and the other personal connection remains connected. Provider session, account, balance, and a seven-day booked transaction read succeeded. New local sync remains for Task 06. The prior account has 1,950 booked rows and remains included for history; its provider UID changed and account presentation is duplicated until Tasks 06 and 07 reconcile identity. Three abandoned pending attempts remain for safe expiry. See `NOTES.md`. |
| 06 | done | The Railway `bank-sync` service is deployed, and the Trigger banking schedule is inactive. An isolated restore test and a bounded production import preserved the old 1,950-row account and name override, skipped historical overlaps, imported seven new rows, and expired three abandoned attempts. The Railway container started after a redeploy; two connections synced, while a third hit an ASPSP background-fetch limit (HTTP 429). The source now defers recent background fetches for six hours without immediate retries for this error. Task 09 retains verification of the next successful unattended run. See `NOTES.md`. |
| 07 | pending | Expose read-only MCP tools for every selected personal and company account. Support account/date filters and cursor pagination, and report data freshness and incomplete pages. Ensure results and totals use booked transactions only. Reconcile old and new rows for the same real account in account presentation and filters, retaining the old name override and historical reads. Verify authorization limits and audit logging. |
| 08 | pending | Connect Executor and update Raycast configuration as needed. Test actual authenticated tool calls from the user’s intended devices and a complete multi-page transaction retrieval. Do not infer success from a connection record alone. |
| 09 | pending | Compare new and old bank results for bounded account/date windows, including amounts, counts, and currencies. Confirm the next Railway cron run at 02:00 UTC on 2026-10-03 actually starts, succeeds after the bank's background-fetch limit clears, restores the limited connection from `error` to `connected`, and leaves booked counts and unique IDs consistent. Verify consent renewal, backup and restore, and the first unattended Executor workflow. |
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
