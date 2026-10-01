# Migration notes and handoff

Updated: 2026-10-01 21:53 UTC. Branch: `codex/bank-mcp-migration`.

## Task 03: Railway configuration import and no-change plan

Evidence captured on 2026-10-01 with Railway CLI 5.49.6. Tasks 01 and 02
were recorded as done before this work. The clean checkout on
`codex/bank-mcp-migration` matched `origin/codex/bank-mcp-migration` after a
fresh fetch. Filesystem reads and writes, the remote fetch, and read-only
Railway calls worked with network access and approval policy `never`. No
approval or automatic approval was requested.

The existing `hidden-village` project was linked only in a temporary working
directory for `railway config pull`. The import was copied into this checkout
as `.railway/railway.ts`; no Railway project-link file was added to the repo.
The source is constrained to project `c6c36c86-d6c0-4c07-b181-d903db2e3b7b`
and production environment `b9e7fc05-5205-4f40-be2d-f6e160aa2d18`.
Railway's SDK reconciles resources by graph address and keeps remote IDs in its
binding state. The imported addresses were checked against fresh Railway
status IDs:

| Imported resource and graph address | Verified live identity |
| --- | --- |
| `Postgres`, `database.Postgres` | Service `404f6fb9-da37-403f-b1f3-e8d6e2c54d60` |
| `mcp`, `service.mcp` | Service `ac79bd9a-021b-4bdb-95a8-40bdaca72393` |
| `web`, `service.web` | Service `c0f5fbc3-2e22-4401-ade8-68671c3a5496` |
| `postgres-volume-r7JC`, `volume.postgres-volume-r7JC` | Volume `ecb799b2-792d-491d-bef4-796be65bd259` |
| `bucket`, `bucket.bucket` | Bucket `561c0021-6adc-458f-8640-ce0525d09b4d` |

The volume's production instance is
`9810bac8-ee35-418a-9330-da0c2487e659`, attached to Postgres service
`404f6fb9-da37-403f-b1f3-e8d6e2c54d60` at
`/var/lib/postgresql/data`. Its live state was `READY`, size 5,000 MB,
236.37 MB used, with no pending deletion. The bucket was present in fresh
Railway status although it was not listed in Task 01's service table; omitting
it from the IaC source would risk a later deletion.

The import retains current source, build, start, pre-deploy, replica,
networking, database, volume, bucket, and variable definitions. Existing
application variable names use `preserve()`; no variable values, credentials,
or connection strings were decrypted, printed, or committed. The root now
pins the `railway` SDK at 3.12.0 so the config can be planned from this
checkout. Biome includes the new file.

The final `railway config plan --json --detailed-exit-code --file
/Users/christian/dev/own/hidden-village/.railway/railway.ts` targeted the
verified production IDs and exited 0. It reported `No changes`, an empty
change set, zero diagnostics, and no staged patch. Both current and desired
graphs contained exactly the five addresses above. In that reviewed snapshot,
there was no deletion, replacement, reset, or other change for Postgres, its
volume, `mcp`, `web`, or the bucket. Re-run and review a fresh plan before any
future apply because live state may drift.

The current and desired graphs are not byte-for-byte equal. The generated
source leaves some live fields unspecified, including application public
domains, explicit Railpack build environment, runtime flags, and the Postgres
required mount path. In this plan the engine treated those omissions as
preserved and still reports zero actions. This source therefore relies on
Railway's sparse import semantics; inspect these fields again in a fresh plan
before any apply.

No config apply, infrastructure change, deployment, migration, data change,
provider setting change, or Raycast change was made. There is still no
verified usable backup or tested restore, so **do not apply a
production-changing plan** until that gate is resolved. `bd prime` remains
unavailable because `bd` is not installed; no beads state was changed.

## Task 02: read-only database and repository comparison

Evidence captured on 2026-10-01 through Railway SSH to the existing Postgres
service. Every SQL call ran inside `BEGIN READ ONLY` and ended with `ROLLBACK`.
Queries returned only anonymous labels, counts, status values, and age summaries.
No account identifiers, transaction content, credentials, or connection strings
were printed or saved. The branch was clean and matched
`origin/codex/bank-mcp-migration` before this documentation update. Its application
code under `apps/` and `packages/` is unchanged from `6b40750`, the deployment
revision recorded in Task 01. Filesystem reads and a remote fetch worked under
the effective full-access, network-enabled context with approval policy `never`.

The repository's `bank_account.included` flag controls personal import selection.
The scheduled job scans only `connected` and `error` Enable Banking connections,
then imports included personal accounts. It imports business accounts on a
syncable connection regardless of their `included` flag. The web account-selection
handler disables other personal rows with the same provider account ID when one
is selected. The provider client requests `BOOK` and excludes returned `PDNG`
entries. Transactions upsert by an internal ID derived from workspace, provider
account ID, and provider transaction ID. Live unique indexes for account provider
ID, connection provider ID, and transaction internal ID are present and unique.
There were zero transaction-to-account or transaction-to-connection scope
mismatches in the live rows.

### Confirmed account and connection state

Labels follow the same live UUID sort order used in Task 01. Connection labels
are new within each workspace and carry no provider identifier.

| Workspace | Connection | Status | Accounts and import eligibility | Booked rows | Last sync | Consent expiry |
| --- | --- | --- | --- | ---: | --- | --- |
| W1 personal | C1 | connected | A2 selected | 1,950 | within 1 day | 112 days ahead |
| W1 personal | C2 | disconnected | no accounts | 0 | 66 days ago | 112 days ahead |
| W1 personal | C3 | connected | A1 and A3 selected; A4 excluded | 591 | within 1 day | 112 days ahead |
| W1 personal | C4 | disconnected | no accounts | 0 | never | 112 days ahead |
| W2 business | C1 | disconnected | A2 and A3 flagged included, but connection is not syncable | 128 | 54 days ago | not recorded |
| W2 business | C2 | connected | A1 and A4 included | 93 | within 1 day | 51 days ahead |
| W2 business | C3 | disconnected | no accounts; unfinished authorization placeholder | 0 | never | not recorded |

W1 A4 is the only account with `included=false`; it has zero transaction rows.
W2 A2 and A3 retain `included=true`, but their disconnected connection is
excluded by the scheduled job. W2 A3 holds all 128 booked rows on that
connection, while W2 A2 has none. Both connected personal connections and the
connected business connection had synced within one day at this snapshot.
An expiry date in the future does not override a `disconnected` status. The
disconnected rows and their reasons were not validated with Enable Banking.

The live database still has 2,762 booked transactions and zero pending
transactions across all eight accounts. There are no older pending rows to
clean up in this snapshot. The personal MCP query has no explicit booked-status
predicate, so a future pending row could still be returned unless that query
changes in a later task.

### Duplicate indicators and limits

- Zero booked groups repeat the same workspace, provider account ID, and
  provider transaction ID. The live unique internal-ID index also prevents
  identical derived internal IDs from coexisting.
- One W1 A2 pair has the same booked timestamp, amount, currency, and resulting
  balance. It contains two distinct provider transaction IDs, and both rows
  were created less than 24 hours apart. This is a **possible duplicate**, not a
  confirmed duplicate. No transaction content was examined.
- The 591 booked rows on W1 A1 and A3 lack a resulting balance. Five groups
  share an account, booked timestamp, amount, and currency, with seven rows
  beyond one per group. These weak matches can be ordinary repeated payments
  and do not justify cleanup. The other 2,171 booked rows have a resulting
  balance. No comparable strong fingerprint groups appeared in W2.
- No provider account ID appears on two connections within a workspace. No
  balance-backed fingerprint appeared across connections using the same
  provider account ID. A bank may change account identifiers on reauthorization,
  so these checks do not prove the absence of cross-connection duplicates.

### Cleanup proposal, not executed

There is no pending-row cleanup to perform. Preserve W2 C1 and its 128 booked
rows: the schema cascades deletion from a connection to its accounts and
transactions. After a usable backup and tested restore exist, review the three
disconnected, account-free connections W1 C2, W1 C4, and W2 C3 for audit or
consent history before considering removal. Privately inspect the W1 A2 pair
against the provider records and encrypted transaction details before deciding
whether either row is redundant. If it is, review dependent search and
attachment records before proposing a precise correction. Do not delete rows
from the aggregate matches alone. No production cleanup was performed.

The comparison cannot establish whether every selected account has complete
provider history or whether the disconnected business accounts should be
reauthorized. Those require provider-side and user-context checks in later
tasks. Task 01's lack of a verified usable restore point remains a blocker for
schema changes, new sync deployment, and removal of any service or data.

`bd prime` remains unavailable because `bd` is not installed on this host.
No beads state was changed; the established Docs ledger records Task 02.

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

- Are the selected accounts fully imported, and should the disconnected
  business accounts be reauthorized? Task 02 verified current database flags
  and sync eligibility, not provider history completeness.
- Is the W1 A2 booked pair a true duplicate? Task 02 found a strong aggregate
  match, but private provider and transaction review is required before any
  correction.
- A usable backup and tested restore procedure are still unverified. The
  current Railway deployment state is recorded above. Confirm that the future
  IaC resource identity refers to the existing database before any apply.
- What MCP connection and authentication arrangement does Executor actually
  use, and what needs to change in Raycast? Verify on the real machines later.
- Which provider and browser redirect URLs are currently registered for bank
  consent? Preserve a working callback through migration.

## Next safe step

Tasks 01 through 03 are complete. Establish and test a usable backup and
restore procedure for the protected Postgres service before any later
infrastructure apply, schema change, cleanup, or cutover. Task 04 can proceed
as a local code refactor without deployment. Do not remove the web app while
the database and consent path are unverified.
