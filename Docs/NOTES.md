# Migration notes and handoff

Updated: 2026-10-01 21:13 UTC. Branch: `codex/bank-mcp-migration`.

## Task 01: live inventory

Read-only evidence captured on 2026-10-01 with Railway CLI 5.49.6 and SQL
inside the existing Postgres container. The checkout was clean on
`codex/bank-mcp-migration` before this documentation update. The effective tool
context allowed filesystem and network access without approval prompts. No
Railway configuration, service, database row, migration, or provider setting was
changed.

### Railway resources and deployment state

Project `hidden-village` is `c6c36c86-d6c0-4c07-b181-d903db2e3b7b`.
Its sole listed environment is `production`,
`b9e7fc05-5205-4f40-be2d-f6e160aa2d18`.
`railway status --project <id> --environment production --json` reported:

| Service | Service ID | Latest deployment and runtime | Live configuration |
| --- | --- | --- | --- |
| Postgres | `404f6fb9-da37-403f-b1f3-e8d6e2c54d60` | `SUCCESS`, one `RUNNING` instance; deployment created 2026-08-22 21:47 UTC | Image `ghcr.io/railwayapp-templates/postgres-ssl:18`; one replica; volume mounted at `/var/lib/postgresql/data` |
| mcp | `ac79bd9a-021b-4bdb-95a8-40bdaca72393` | `SUCCESS`, one `RUNNING` instance; deployment created 2026-08-25 07:56 UTC | GitHub `main` at `6b40750`; Railpack build `pnpm --filter @hidden-village/mcp build`; start `pnpm --filter @hidden-village/mcp start`; one replica; no cron or pre-deploy command |
| web | `c0f5fbc3-2e22-4401-ade8-68671c3a5496` | `SUCCESS`, one `RUNNING` instance; deployment created 2026-08-25 07:56 UTC | GitHub `main` at `6b40750`; Railpack build `pnpm --filter @hidden-village/web build`; start `pnpm --filter @hidden-village/web start`; pre-deploy `pnpm db:migrate:prod`; one replica; no cron |

The Postgres volume instance is
`9810bac8-ee35-418a-9330-da0c2487e659`, state `READY`, with no pending
deletion. Railway reported 236.37 MB used of a 5,000 MB volume. These are
Railway status indicators, not an application health or restore test.

Variable **names only** were inspected. Postgres exposes `DATABASE_URL` and
Postgres connection variables; both app services have `DATABASE_URL`. The MCP
service has MCP auth/transport and personal-search variable names. The web
service has Enable Banking, Trigger, and auth variable names. Values and
connection strings were not printed or stored. This confirms configuration
presence, not that each integration works.

### Database aggregates

The query used `BEGIN READ ONLY` and grouped by workspace, account, and
transaction status. Labels are assigned from the live UUID sort order solely
for this snapshot. They reveal no workspace or bank account identifier.

| Workspace | Kind | Account | Included | Booked | Pending | Total | Oldest booked | Newest booked |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |
| W1 | personal | A1 | yes | 134 | 0 | 134 | 2026-07-14 | 2026-09-29 |
| W1 | personal | A2 | yes | 1,950 | 0 | 1,950 | 2025-02-03 | 2026-09-28 |
| W1 | personal | A3 | yes | 457 | 0 | 457 | 2023-08-07 | 2026-09-28 |
| W1 | personal | A4 | no | 0 | 0 | 0 | none | none |
| W2 | business | A1 | yes | 93 | 0 | 93 | 2026-05-29 | 2026-10-01 |
| W2 | business | A2 | yes | 0 | 0 | 0 | none | none |
| W2 | business | A3 | yes | 128 | 0 | 128 | 2026-02-10 | 2026-08-07 |
| W2 | business | A4 | yes | 0 | 0 | 0 | none | none |

W1 has 2,541 booked rows and W2 has 221. Overall there are 2,762 booked
rows, zero pending rows, and 2,762 total bank transaction rows. The oldest
booked date is 2023-08-07 and the newest is 2026-10-01. This is a database
snapshot, not evidence of import completeness or absence of duplicate rows.

The live `drizzle.__drizzle_migrations` table has 15 rows. Its largest
`created_at` is `1785165647982`, matching repository journal entry
`0014_shiny_cobalt_man`. The live schema contains the expected workspace,
bank account, and bank transaction tables. No migration was run. This checks
the latest journal version, not every migration hash.

### Backup and restore limitation

`railway postgres pitr status` reported PITR disabled and no backup bucket
wired for this Postgres service. `railway postgres pitr schedule list` returned
no schedules. `railway postgres pitr backup list` returned one on-demand
backup, ID `75d0f1ba-f145-40d4-bcea-bc009d6a3cfb`, created 2026-08-22,
with an expiry timestamp of 2026-09-21. The CLI still listed it on
2026-10-01, but its actual availability and restorability are unverified.

Railway exposes a volume-backup restore command and a PITR restore command
that creates a new service. No restore was attempted. With PITR disabled, no
schedule, and the only listed backup past its expiry timestamp, there is no
verified usable restore point or tested restore procedure. Establish and test
one before any schema change, new sync deployment, or service removal.

`bd prime` could not run because `bd` is unavailable on this host. No beads
issue or state was changed; this plan and note carry the task status.

## Verified so far

- The branch was created from clean `main` at commit `6b40750`. No application,
  database, Railway, Raycast, or provider changes have been made in this branch.
- `railway list --json` showed a `hidden-village` project with one `production`
  environment and three named services: `Postgres`, `mcp`, and `web`. Task 01
  verified their current deployment state and database aggregates above.
- `railway status` without an explicit project failed because this checkout is
  not linked to a Railway project. Use explicit project/environment selection
  for read-only inspection. Task 01 completed a fresh detailed status read.
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

- Which personal and business bank connections are current, and are the
  included accounts fully imported? Do not write identifiers or transaction
  details into this document.
- Are any booked rows duplicated? Compare safe aggregates before proposing
  any correction. Task 01 found zero rows with pending status.
- A usable backup and tested restore procedure are still unverified. The
  current Railway deployment state is recorded above. Confirm that the future
  IaC resource identity refers to the existing database before any apply.
- What MCP connection and authentication arrangement does Executor actually
  use, and what needs to change in Raycast? Verify on the real machines later.
- Which provider and browser redirect URLs are currently registered for bank
  consent? Preserve a working callback through migration.

## Next safe step

Task 02 is next in the task ledger. Keep it read-only. Before any later
infrastructure apply, schema change, or cutover, verify a usable backup and
restore procedure for the protected Postgres service. Do not remove the web
app while the database and consent path are unverified.
