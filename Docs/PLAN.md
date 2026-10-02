# Bank Data MCP migration

Status: planning. Working branch: `codex/bank-mcp-migration`.

## Goal

Keep a small, reliable, read-only bank data service. Bank Data retains its
Postgres transaction history, Drizzle schema and migrations, Enable Banking
connection, scheduled import, and MCP access. ChatGPT through Executor handles
reasoning, invoice discovery, and instructions for where to search. Executor runs
on the user's other machine and can use its own email, browser, computer, and
file connections. Bank Data does not need to import invoices or make
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
| 07 | done | Added `list_bank_accounts`, `list_bank_transactions`, and `summarize_bank_transactions` to the existing personal and business MCP contexts. Selected accounts include disconnected company rows with history. Personal renewals sharing encrypted IBAN and currency use the oldest selected row as a stable public ID, accept either source ID as a filter, use the active row for balances and freshness, and retain the old name override. Both new tools and existing personal reads filter to booked rows. A disposable restore plus authenticated local MCP calls verified account grouping, old and new pages, booked-only totals, token boundaries, and audit records. A live authenticated business MCP read and Railway audit logs also passed. Tests, typechecks, Biome, and server build passed. Intended-device and complete Executor retrieval remain for Task 08; unattended sync remains for Task 09. See `NOTES.md`. |
| 08 | done | Executor on the home Mac used a user-owned `hidden_village_bank` bearer connection. Its 11 legacy finance and attachment tools were blocked by verified full-address policies; only the three bank reads were allowed through this connection. Authenticated Executor calls returned four selected company accounts and traversed all 222 booked transactions in five pages, with unique IDs and currency counts matching the totals tool. On this Mac, Raycast's Personal Finance server passed account and paginated transaction calls, and Raycast `@executor` passed a corrected bank account call through the user-owned connection. The old direct Hidden Village Raycast entry fails OAuth dynamic registration and remains for later retirement. Executor's legacy integration was removed later in Task 13. See `NOTES.md` for the parser correction, credential scope, audit evidence, and freshness limits. |
| 09 | in progress | The restored pre-sync snapshot, current Postgres, and authenticated Executor bank reads agree across two bounded UTC windows for all four selected company accounts: SEK counts, exact credit/debit/net amounts, unique booked IDs, and complete pages. Personal source rows match the snapshot except for the expected seven new rows on the renewed account. The retained dump restored with 15 migrations, and the live renewal state remains intact. Railway schedules the next run for 2026-10-03 02:00 UTC. A user-requested manual run on October 2 refreshed Nordea and Revolut, but SEB again returned HTTP 429 with valid consent. Successful unattended execution, SEB recovery, and the first scheduled Executor bank workflow still require observation. See `NOTES.md`. |
| 10 | pending | After acceptance, retire the old web service, Trigger.dev jobs, Cloudflare personal search worker, obsolete storage/invoice code, and unused Railway resources. Review every deletion and infrastructure plan against the live database before applying it. |
| 11 | done | A dedicated read-only all-bank MCP scope is deployed with its own Railway token and one healthy Executor `allBanks` connection. It labels every selected account and booked transaction by bank and personal/business workspace. A live read found 1,957 Nordea, 597 Revolut, and 222 SEB booked rows; all 2,776 unique rows paginated in 14 pages and matched exact totals. Executor account, totals, and Revolut-filtered transaction calls passed. The existing business token cannot see the all-bank tools. See `NOTES.md`. |
| 12 | done | Checked the SEB business consent before prompting renewal. The active connection remains authorized until 2026-11-22 and last synced on 2026-10-02; its current error is `ASPSP_RATE_LIMIT_EXCEEDED` (HTTP 429), not expired consent. No new authorization was started. The next scheduled bank-sync run at 2026-10-03 02:00 UTC is covered by Task 09. The 222 stored SEB booked rows remain readable through `allBanks`. The later Executor connection retirement is recorded in Task 13. |
| 13 | done | At the user's request, removed the `hidden_village_bank` Executor integration and its three connections after verifying that `bank_data.org.allBanks` uses the new MCP endpoint and returns the same stored booked totals. Removed all 11 orphaned policies referencing the old business connection. A post-removal account read returned seven selected account groups, and the totals tool counted 2,776 stored booked rows. Clients using the old Executor tool addresses must switch to `tools.bank_data.org.allBanks`; the direct Raycast entry was not changed. See `NOTES.md`. |

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
  AI prompts in Bank Data. Executor and ChatGPT own those workflows.
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
