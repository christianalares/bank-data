# Migration notes and handoff

Updated: 2026-10-02 00:59 UTC. Branch: `codex/bank-mcp-migration`.

## Task 05: consent service prepared, live verification blocked

### Redirect registration and resumed live check

On 2026-10-02, the user signed in to the Enable Banking Control Panel and
the coordinating task added
`https://hidden-village-mcp.up.railway.app/banking/callback` to the existing
Hidden Village production API application as its third allowed redirect URL.
The UI reported `Application has been edited`. The coordinating task then
reopened API applications and verified that the new URL persisted and both
previous callback URLs remained. No other application setting was changed.
This is provider UI evidence. A real personal renewal then reached the
callback and account selection page, but saving the selected account returned
HTTP 403 with `Account selection is not authorized` on the user's phone. Safe
Railway HTTP logs show callback GET 303 at 00:38:44 UTC, selection GET 200 at
00:38:44 UTC, then selection POST 403 at 00:38:55 UTC. The GET confirms the
signed selection cookie was valid at that point. The POST failure came from
the request guard, but the logs do not identify which input failed. The old
connection remains active; the renewal has not been confirmed. Do not ask the
user to repeat BankID until the form fix is deployed and checked.

The fix accepts a missing `Origin` only when a short-lived signed selection
cookie and an HMAC-bound form token are both valid. A supplied foreign origin
still fails. The cookie uses `SameSite=None; Secure` so the provider redirect
chain can carry it on a form POST. A selection GET also refreshes the existing
short-lived cookie with that attribute, so a page loaded before deployment
can be reloaded without repeating bank authorization while the signed cookie
is still valid. The local integration test now
covers the missing-origin save, absent token, and foreign origin. The user
must reload the selection page after deployment to receive the new form token;
the old form cannot be submitted under the fixed guard.

The fix passed typechecks, Biome, the full unit suite, a fresh migrated
Postgres 18 integration run, the root build, Drizzle check, and the MCP smoke
test. The retained backup checksum still matched the pre-Task-05 record. A
fresh Railway plan reported no infrastructure changes. GitHub HTTPS push
could not read the local macOS credential, and `gh` reported its token invalid.
The same five committed file blobs and tree were published through the
connected GitHub API as commit `6a20a6d`; their blob and tree hashes matched
the local commit. The branch ref advanced without force. A subsequent public
fetch confirmed the remote commit and the local branch was aligned to it with
the identical tree. Railway deployed that commit to the MCP service as
`be48c1f3-3560-40ee-97eb-abaeaecf4391`, which reached `SUCCESS` at
00:44:55 UTC. A read-only production aggregate showed two existing personal
connections still connected and two new pending connections, one with a
completed callback and one discovered account. A deployed-service GET for the
pending selection returned 200, `SameSite=None`, a form token, and one
account checkbox. No account selection was submitted by this check. The user
was asked to reload and submit the phone form before the signed cookie expires.
The user requested a fresh link when the first selection session was lost.
A new personal Nordea renewal was initiated through the restricted MCP tool
without changing the old connected rows. The callback again returned 303 and
the selection GET 200 at 00:49:27 UTC, but the phone selection POST returned
403 at 00:49:36 UTC. The earlier guard fix therefore has not solved the live
phone issue. A follow-up patch records only guard booleans and a phase label
on rejected POSTs, without IDs, cookies, request bodies, headers, or account
details. The user should retain the current phone session while this diagnosis
is deployed; do not ask for another BankID flow yet. Task 05 remains blocked
until the guard cause is identified and the live save and renewal are confirmed.

The user's screenshots confirm the 403 was in the original iOS in-app browser.
Opening `/banking/select` separately in Vivaldi showed `Account selection
expired`, which is expected because that browser did not have the signed
selection cookie. The exact failed POST check cannot be recovered from the
earlier logs. Safe boolean diagnostics are deployed on commit `ab8decf` and
will identify the failing phase on any new POST. To support the possibility
that the in-app browser omits its cookie on POST, the selection form now also
carries the short-lived signed proof issued on GET. The POST verifies that
proof, an independent HMAC form token, its expiry, a form content type, and
any supplied origin. A foreign origin still fails; an absent or opaque origin
is accepted only with valid signed form credentials. The proof remains in the
form body, with `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and
a restrictive content security policy. Local integration passed for a
cookie-less POST, a missing form token, a foreign origin, and an opaque origin.
This mobile flow fix still needs production deployment and the user's live
selection before Task 05 can be marked done.

The mobile form fix deployed as MCP commit `6f87080` and live GET returned
the signed form proof, CSRF field, and one account checkbox; a deliberate
POST without the CSRF field returned 403. The user then completed a new Nordea
authorization in Vivaldi but saw the generic callback error before selection.
Safe Railway HTTP logs show two GETs to `/banking/callback` from the same IP,
user agent, and host within 91 ms at 00:56:05 UTC: the first returned 303,
the second 400. A read-only production query confirms the consent created at
00:54 UTC remains pending with a completed provider payload and one discovered
account, while both previous personal connections remain connected. This
strongly supports a duplicate callback after the first successful one; the
proxy logs do not retain query parameters, so the two codes and states cannot
be compared directly. The user's Vivaldi session may still hold the selection
cookie from the successful 303. The same browser can try `/banking/select`
without repeating BankID; another browser cannot use that cookie.

The callback is being made idempotent for future flows. The start operation
stores HMAC hashes of the authorization state, and successful completion adds
an HMAC hash of the one-time callback code. A repeated callback with the same
state and code can then return the already completed result without exchanging
the provider code again. A mismatched code still fails. The local integration
test verifies a repeated callback returns 303 with no second provider session,
and replay with a different code returns 400. The current Vivaldi flow began
before those hashes were stored, so its recovery depends on the cookie in
that same browser. Do not issue another bank authorization before checking
that recovery path.

The checkout was clean and
matched `origin/codex/bank-mcp-migration` at `491b3ea` on resumption. The
retained backup still had mode `0600` and its SHA-256 matched the recorded
value below. The then-latest MCP deployment
`6f951d8c-d69f-400b-84e8-40599573cb79` remained `SUCCESS`.

The clean branch matched `origin/codex/bank-mcp-migration` at `0e682ce`
after a fresh fetch. Tasks 01 through 04 were checked against this plan and
the checkout before editing. Filesystem and network access were effective,
with approval policy `never`. `bd prime` was unavailable because `bd` is not
installed, so the Docs ledger records this task.

The MCP HTTP service now accepts a dedicated `BANK_CONSENT_MCP_TOKEN` that must
be distinct from `MCP_API_TOKEN`. That context exposes only
`start_bank_consent` and `get_bank_consent_status`. The initiation result has
one field, the authorization URL. The status result contains aggregate counts
by workspace kind and no bank, connection, or account identifiers. The
service uses configured internal workspace IDs and a fixed redirect origin;
neither is supplied by an MCP client. The new callback is
`/banking/callback` on the MCP HTTP service. It exchanges the code on the
server, stores the session, and either activates business accounts or sends
the browser to a minimal account-selection form. The form uses a signed,
short-lived, HTTP-only cookie with a secret distinct from the MCP bearer
token, checks the POST origin, and activates selected
personal accounts. Renewal copies selection for matching provider accounts
and disconnects the previous connection only when the replacement is active.
The new handlers do not write codes, provider credentials, tokens, connection
strings, or account IDs to MCP results or logs. Personal account and
session payloads are encrypted in Postgres. The old web consent route,
Trigger import, and current MCP tools remain in source. The new callback
does not import transactions; the existing sync path can pick up active
selected accounts until Task 06 replaces it.

### Backup and isolated restore

Fresh Railway status still identified the protected Postgres service as
`404f6fb9-da37-403f-b1f3-e8d6e2c54d60`. PITR remained disabled and
`bucketWired=false`. An additive on-demand `railway postgres pitr backup
create` returned `Failed to create a backup` and created no new listed backup.
No original service or volume was changed. A custom-format `pg_dump` was then
streamed through Railway SSH directly into a local file without printing its
contents or connection string. The retained file is
`/Users/christian/.local/share/hidden-village/backups/2026-10-02-pre-task-05.dump`.
Its directory is mode `0700`, the file is mode `0600`, its size is 3,908,033
bytes, and SHA-256 is
`5d62015908a4302d52cbe0aacfe91077140d8e3c21f4caa5e7d8be82f084065b`.
It is outside the repository and contains sensitive production data. This is
a retained local backup, not a Railway-managed or offsite backup.

The dump restored without error into a disposable local PostgreSQL 18
container using `pg_restore --no-owner --no-acl`. Read-only aggregate checks
in that isolated container returned 7 bank connections, 8 bank accounts,
2,762 bank transactions, and 15 Drizzle migration rows, matching the Task 01
snapshot. The test container was stopped and removed. The tested restore
procedure, using only a disposable local container, is:

```bash
docker run --rm -d --name hv-restore-check -e POSTGRES_PASSWORD=local-restore-test postgres:18
docker exec -i hv-restore-check pg_restore -U postgres -d postgres --no-owner --no-acl < /Users/christian/.local/share/hidden-village/backups/2026-10-02-pre-task-05.dump
docker exec hv-restore-check psql -U postgres -d postgres -Atc "select 'connections=' || count(*) from bank_connection union all select 'accounts=' || count(*) from bank_account union all select 'transactions=' || count(*) from bank_transaction union all select 'migrations=' || count(*) from drizzle.__drizzle_migrations order by 1"
docker stop hv-restore-check
```

Never restore this dump over the original Railway Postgres service. Refresh
the backup immediately before any later production-changing apply or
deployment because live imports may advance the database.

### Local checks and live MCP deployment

The normal unit suite passed with 20 tests and one conditional integration
test skipped when no local test database is configured. The conditional test
was run separately against a fresh local PostgreSQL 18 database after all 15
migrations were applied. Its three tests passed with mocked Enable Banking
responses. They exercised restricted MCP tool listing, initiation, callback,
personal account selection, renewal, replay rejection, POST origin rejection,
and business account activation. This is local/mock evidence, not a real
Enable Banking or bank authorization. `pnpm build:server`, `pnpm build:web`,
`pnpm typecheck`, `pnpm check`, `pnpm db:check`, and `pnpm test:smoke` passed.
All Drizzle migration files remain untouched. No production migration,
provider setting change, live consent, or live bank sync was performed.

The Railway authoring file uses an MCP-only deployment from
`codex/bank-mcp-migration` with the new root build and start commands. The
existing web service remains on its current source and commands. A fresh
linked production plan returned three changes, all on `mcp`: source branch,
build command, and start command. It returned zero diagnostics, no staged
patch, and the same five current and desired resource addresses: Postgres,
`mcp`, `web`, the Postgres volume, and the bucket. There was no planned change
or deletion for Postgres, its volume, `web`, or the bucket. The existing MCP
endpoint returned HTTP 200 for `/health` and an authenticated tool list with
11 legacy tools before the apply.

The MCP service had `DATABASE_URL` and `PERSONAL_DATA_ENCRYPTION_KEY` but
lacked the provider and consent settings. The required Enable Banking
application ID and private key were copied from the existing web service to
`mcp` through stdin without printing their values. Separate random MCP and
cookie secrets, the fixed HTTPS redirect origin, and both internal workspace
IDs were set with deployment suppressed. A variable-name check confirmed all
seven new settings. The existing MCP deployment remained unchanged until the
reviewed plan was applied. The configuration commands did not print secret
values, workspace IDs, or connection strings, and none were committed.

The plan was pinned after the backup checksum was rechecked. The pinned apply
changed only the three reviewed `mcp` fields. Deployment
`71f328ca-7205-46bb-8089-bc4418e891e4` reached `SUCCESS`. A post-apply
plan returned `No changes`, zero diagnostics, and the same five resource
addresses. The `web` deployment remained the previous successful deployment
`8a88ae21-4a6b-4ed9-b12b-a7ee59aaf58a`. The protected Postgres service
retained ID `404f6fb9-da37-403f-b1f3-e8d6e2c54d60`. No web, sync,
schema, Postgres, volume, or bucket apply was made.

Live HTTP checks after deployment returned 200 for `/health`, both bearer
scopes, and the existing `get_finance_overview` tool. The business scope
still listed 11 legacy tools and did not expose `start_bank_consent`. The
dedicated consent scope listed only `start_bank_consent` and
`get_bank_consent_status`; its aggregate status tool completed successfully.
A callback without code and state returned a generic HTTP 400. These are
live service and read-only database checks, not a real bank authorization.

The new callback URL is
`https://hidden-village-mcp.up.railway.app/banking/callback`. It was added
to the existing Enable Banking application's allowed redirect URLs while
retaining the current web callback, as recorded above. Enable Banking's
[Control Panel guide](https://enablebanking.com/docs/api/control-panel/)
places application editing under API applications and the application's
context menu. Next, initiate one consent through the
restricted MCP tool, have the user complete bank consent and account
selection in a browser, verify the resulting connection and selected accounts
in Postgres, then repeat as a renewal. Do not mark Task 05 done until both
real callback and renewal have been verified. Refresh the local backup before
any further production-changing apply or deployment.

## Task 04: single package refactor, local verification only

Tasks 01 through 03 were marked done in `PLAN.md` before this task. The
checkout was clean at `ed19201`, and a fresh fetch confirmed that the local
branch matched `origin/codex/bank-mcp-migration`. The effective context allowed
filesystem and network access with approval policy `never`; no approval or
automatic approval was requested. `bd prime` again failed because `bd` is not
installed, so this plan and notes remain the task ledger.

There is now one application `package.json` at the repository root. The MCP,
provider, database, finance, storage, auth, jobs, and utility source moved
under `src/`. The legacy web routes remain in `apps/web/src` so the Enable
Banking callback and account selection path are available for Task 05. The
existing Trigger task and schedule remain in `src/jobs/tasks/sync-banking.ts`
for Task 06. Its run body is shared with the separate `src/sync/index.ts` entry
point; this is a code path for future cron use, not a deployed replacement for
Trigger. Root scripts replace Turbo and pnpm workspace filters. The lockfile
has only the root importer, and direct dependencies that drifted during the
first install were pinned to their previous locked versions. The previous MCP
HTTP tool implementations, authentication rules, and personal finance
paging code were retained. The provider still requests `BOOK` and removes
returned `PDNG` entries. A new test covers pending entries on both pages of a
provider response.

All 31 files moved from `packages/db/drizzle` to `drizzle` match their blobs in
pre-refactor commit `ed19201` byte for byte, including all 15 SQL migrations,
15 snapshots, and
`meta/_journal.json`. `pnpm db:check` passed. A fresh, temporary Postgres 17
container with a temporary data directory accepted `pnpm db:migrate:prod` with
`DATABASE_URL` explicitly set to `127.0.0.1:55433`. The resulting
`drizzle.__drizzle_migrations` table contained 15 rows and ended at
`1785165647982`, matching the live journal version recorded in Task 01. A
second temporary local database accepted the migrations and the built sync
entry point returned zero connections, accounts, and transactions, then exited
successfully. The first empty sync run exposed an open client connection; the
new entry point now closes that connection in a `finally` block. Final checks
repeated the migration and empty sync against another isolated local database.
All temporary Postgres containers were stopped and removed.

Local checks passed: `pnpm build:server`, `pnpm build:web`, `pnpm test`
(6 files, 18 tests), `pnpm typecheck` (root and legacy web), `pnpm check`,
`pnpm db:check`, and `pnpm test:smoke`. The smoke test starts the built MCP
HTTP process without a database URL, checks `/health`, verifies that `/mcp`
requires a bearer token, and invokes the built sync entry point with `--help`.
Against a temporary local Postgres database, the final built web process
served `/login` with HTTP 200. An unauthenticated request to the legacy bank
callback redirected to `/login` with the expected missing-parameter error in
the redirect target. These checks did not supply a provider authorization code.
The first unlocked dependency install produced a Zod `validate` export warning;
pinning the previously locked versions removed that warning in the final full
build. An authenticated web and consent flow check remains necessary before
cutover.

No provider request, live bank sync, MCP transaction tool call, consent flow,
production migration, Railway apply, deployment, data change, provider setting
change, or Raycast change was performed. These local checks do not prove bank
data completeness or equivalent sync behavior. The existing
`.railway/railway.ts` resource graph and commands are untouched. Its legacy
workspace commands need a reviewed update before deployment; do not apply a
production-changing plan while the usable backup and tested restore gate from
Task 01 remains open. The new `railway.mcp.toml` has no pre-deploy migration.

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

- The branch was created from clean `main` at commit `6b40750`. Tasks 01 through
  03 changed documentation and imported Railway configuration. Task 04 changed
  local application source and build tooling without a deployment or live data
  change.
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

Tasks 01 through 04 are complete. Establish and test a usable backup and
restore procedure for the protected Postgres service before any later
infrastructure apply, schema change, cleanup, or cutover. Task 05 can develop
the consent path locally, but the current web callback must remain until a
complete authorization and renewal flow has been verified. Before deployment,
review the Railway resource graph, update its legacy build and start commands,
and inspect a fresh plan for every existing resource, especially Postgres and
its volume.
