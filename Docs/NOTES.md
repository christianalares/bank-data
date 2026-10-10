# Migration notes and handoff

Updated: 2026-10-05 07:33 UTC. Branch: `codex/bank-mcp-migration`.

## October 5 unattended bank sync and final migration check

The scheduled `bank-sync` container started at 02:03:01 UTC and logged a
successful completion at 02:03:09 UTC: three synced connections, five accounts,
70 processed transaction upserts, 21 historical overlaps skipped, and zero
deferred connections, booking-date drifts, or expired pending attempts. The
Railway deployment reports `SUCCESS` with its cron instance exited; the
available log does not include a separate numeric exit code. A read-only
production query found three connected connections without errors, all last
synced between 02:03:01 and 02:03:07 UTC, 11 account rows, 2,785 booked rows
with 2,785 distinct database and internal IDs, zero pending rows, and 132
attachment rows. The booked count is four higher than the previous verified
October 4 snapshot.

An authenticated call to the production MCP `allBanks` scope exposed only its
three bank read tools. It returned five selected connected account groups,
all synced in the same October 5 run. Complete cursor pagination returned
2,785 unique booked rows in 14 pages, only from selected accounts, with no
repeated cursor. The exact credits, debits, net, and row counts matched the
three grouped totals returned by the separate summary tool. A bounded October
4 to 5 UTC read returned two unique rows in one complete page and matched its
summary count. These checks read stored data and did not call the bank provider.
The Executor-specific connection was not available to this run; its
post-retirement authenticated read was verified on October 4.

The canonical iCloud Drive archive verifier passed again for all 154 objects,
132 registered attachments, and 22 other objects. `railway bucket list` for
production is empty, and the retired bucket ID cannot be opened in that
environment. The project-level `railway status` still includes a bucket
identity, but no bucket is deployed in production. The three intended services
remain, Postgres is running with its original ready volume, and MCP is running
with a successful deployment. A fresh production IaC plan has zero changes,
diagnostics, and staged patch; both graphs retain Postgres, its volume, MCP,
and `bank-sync`.

## 2026-10-10: SEB company payment feasibility investigation

The deeper parallel research pass added YAXI's genuine free real-bank tier
(SEB Sweden currently appears as coming soon), Aritma and Finshark as additional
API candidates, the actual SEB GCA tariff and bank-held approval queue, and the
2026 retirement of legacy direct Bankgiro supplier files. It inspected actual
Dooer and accounting API schemas to separate payment records from initiation.
The user clarified that their accountant uses Fortnox and they want to preserve
their current pay-then-send-attachments workflow. No free API meeting all of
these requirements was verified. Findings are consolidated in
`PAYMENT-API-COMPARISON.md`; no provider contact or financial operation occurred.

Follow-up: the user requested costs and alternative payment APIs and ruled out
browser automation. `PAYMENT-API-COMPARISON.md` records the public-source
comparison, including provider minimums where published, SEB's separate partner
integration fees, and unresolved low-volume quotes. A free test environment or
licence-use statement is not evidence of free live payments. No vendors were
contacted, no accounts created, and no production changes or payments initiated.
Confirmed volume: 1–10 company invoices/month. Documentation validation:
`git diff --check` and `pnpm check` passed (39 files checked).

The user requested investigation of explicit MCP payments for mostly Swedish
company invoices, with one authorized signer, and accepted bank approval for
every payment. Invoice extraction stays with the assistant. Public primary
sources and local code were inspected; findings, limitations, proposed security
requirements, and an unsent provider inquiry are in `SEB-PAYMENTS-RESEARCH.md`.

This is research evidence, not live payment acceptance. The current MCP remains
read-only for bank data. No provider account was created, no vendor message was
sent, and no bank consent, payment, database, or infrastructure mutation was
performed. Provider eligibility, cost, mandatory approval without exemptions,
and actual SEB same-phone authorization remain unverified. The historical
migration decisions and cutover gates are unchanged.

Documentation validation: `git diff --check` and `pnpm check` passed. No runtime
files changed; payment behavior was not tested or implemented.

## Task 10: final bucket retirement and production verification

The user confirmed that an archived document opens from the canonical iCloud
Drive folder on their phone. On this Mac, the canonical archive initially
occupied no local data blocks because iCloud had offloaded its files. Running
`verifiera-bucket-arkiv.py` hydrated and rechecked the archive against its
recorded manifest and attachment metadata digests. All 154 objects, 132
registered attachments, 22 unregistered objects, file sizes, and SHA-256
content hashes passed. The canonical `bookkeeper-os` archive and its verifier
remain in place.

A fresh Railway production plan initially showed exactly six destructive
changes: remove the five `mcp.AWS_*` bucket variables and delete
`bucket.bucket`. It had zero diagnostics and no staged patch. Both current
and desired graphs retained `database.Postgres`, its existing volume,
`service.mcp`, and `service.bank-sync`. The plan was saved outside the repo
with the environment config etag. The first pinned apply removed the five
variables and triggered a successful MCP redeploy, but the bucket remained
live. A second IaC apply reported `applied` with no recorded changes while a
fresh plan still proposed the bucket deletion. The exact production bucket
`561c0021-6adc-458f-8640-ce0525d09b4d` was then deleted directly with
Railway's bucket command, which returned `committed: true`.

Final Railway inventory lists no buckets and three services: Postgres, MCP,
and `bank-sync`, all with successful deployments. The existing Postgres volume
remains mounted at `/var/lib/postgresql/data`, and the sync cron remains
`0 2 * * *` UTC. The five AWS bucket variable names are absent from MCP's
live variable list. A fresh IaC plan reports `No changes`, zero actions and
diagnostics, and no staged patch. The MCP `/health` endpoint returned HTTP 200.
An authenticated Executor `bank_data.org.allBanks` read after the retirement
returned five selected connected account groups, last synced on October 4,
and 2,781 booked transactions: 1,960 Nordea personal, 597 Revolut personal,
and 224 SEB business, all SEK. The existing earlier full cursor traversal
confirmed all 2,781 rows. No provider sync or database mutation was started
for this retirement.

## Task 10: Trigger project, bank-only MCP, and bucket retirement gate

The Trigger dashboard for the old `hidden-village-app` project showed no
executing runs and no runs after the Gmail schedule removal. The project was
deleted using its exact project slug. The dashboard redirected to new-project
creation, and a fresh Trigger project listing no longer contains its project
reference. The unrelated Vitalplus project remains. Browser screenshot capture
timed out on the locked host, so the dashboard transition and fresh provider
inventory are the verification evidence.

Commit `181c23d` removed the legacy business MCP invoice and attachment tools,
their service, preview and storage code, and the unused application packages.
The business token now exposes only three read-only bank tools. A focused MCP
tool-list test confirms this, while the separate all-bank scope still exposes
its own three reads. Typecheck, 35 active tests, Biome, Drizzle check, build,
and MCP smoke checks passed. Both Railway deployments reached `SUCCESS`.
An authenticated Executor read after deployment still returned five selected
connected groups, fresh on October 4, and 2,781 booked transactions.

The canonical archive in `bookkeeper-os` has all 154 bucket objects plus
132 rows of attachment metadata. Its independent verifier checked every file
hash and byte count, all 132 registered keys, the 22 other objects, and the
manifest and metadata digests. The canonical project's
`kontrollera-underlag.py --write-report` completed with zero errors. The
archive lives in the Mac Documents folder, which is linked to iCloud Drive;
the sync status reported no pending archive item. A server-side or phone read
of the new iCloud Drive copy has not yet been confirmed. The original private
archive is still present as a second local copy.

After the replacement MCP code deployed and old Trigger project was deleted,
a fresh read of every live bucket object matched the archive: 154 objects,
21,144,232 bytes, zero missing keys, and zero size or SHA-256 mismatches.
The bucket is still live. A pinned Railway plan prepared for its retirement
has six destructive changes: delete the five `mcp.AWS_*` bucket credentials
and delete `bucket.bucket`. It has zero diagnostics or staged patch. Current
and desired graphs both retain `database.Postgres`, its existing volume,
`service.mcp`, and `service.bank-sync`; no database or service deletion is in
the change set. This plan has not been applied while independent archive
access is pending confirmation. The proposed bucket removal was kept out of
the committed IaC, so the branch still describes the live bucket. Recreate
and review the plan from fresh production state before any later apply.

## Task 10: Trigger source and personal search retirement

Commit `2d0c44d` removed the legacy Trigger task source and client dependency,
plus the call to the personal search Worker. The retained personal transaction
text filter uses only the existing hashed token index in Postgres. Typecheck,
36 active tests, Biome, Drizzle check, build, and the MCP smoke check passed.
The new MCP and bank-sync deployments both reached `SUCCESS`. A fresh
authenticated Executor read still showed five connected, freshly synced
account groups and 2,781 booked transactions. No provider call was forced.

Cloudflare showed one old `hidden-village-personal-search` deployment and a
dedicated Vectorize index with 2,547 derived vectors. After the replacement
code deployed, the Worker was deleted and its absence confirmed. The dedicated
index was deleted separately; a fresh index list no longer contains it. The
unrelated `ai-os-memories` index remains. A pinned Railway plan then showed
exactly two variable deletions, `mcp.PERSONAL_SEARCH_API_TOKEN` and
`mcp.PERSONAL_SEARCH_SERVICE_URL`, with zero diagnostics, no staged patch, and
the same Postgres, volume, MCP, bank-sync, and bucket resources in both graphs.
Both variables are absent from live MCP configuration; bank and bucket variables
remain. The follow-up IaC plan shows zero changes, and the MCP deployment is
healthy. The retired Worker source has been removed from this branch.

All 132 production attachment rows belong to the business workspace and have
132 distinct bucket keys. The 154-object, 21,144,232-byte final archive and
its 132-row attachment metadata were copied to
`/Users/christian/Documents/Hidden Village AB/bookkeeper-os/docs/historik/migrering-2026-10-04/bucket-arkiv`.
The archive verifier checked every object size and SHA-256, every registered
key, the 22 unregistered objects, and the manifest and metadata digests. The
canonical project already has local content matching 150 archived objects.
The four unmatched unique files are one newer PDF and three older preview PNGs.
The PDF is preserved in the archive but is not yet in the active accounting
inventory. The original private archive remains as a second copy, and the live
bucket remains untouched while the final access path is reviewed.

## Task 10: October 4 sync, Gmail freeze, and web retirement

The first unattended Railway `bank-sync` after the Task 14 connection cleanup
started at 02:04:14 UTC and completed at 02:04:23 UTC without an error. Its
structured log reports three synced connections, five accounts, 67 processed
transaction upserts, 23 historical overlaps skipped, zero deferred connections,
zero booking-date drifts, and zero expired pending attempts. These upserts are
processed rows, not 67 newly booked rows. A read-only production query found
three connected connections with no errors, 11 account rows, 2,781 booked
transactions with 2,781 distinct database and internal IDs, zero pending rows,
and 132 attachment rows. The latest connection sync was at 02:04:21 UTC.

The authorized Executor `bank_data.org.allBanks` connection returned five
selected account groups, all connected and freshly synced. Complete cursor
pagination returned 13 pages of 200 and one page of 181, with 2,781 unique
booked IDs, no repeated cursor, only selected accounts, and a complete final
page. The grouped exact credit, debit, and net totals matched the independent
totals tool for all three bank and workspace groups. A bounded October 3 to 4
UTC read contained one booked row, with matching count and complete pagination.
No provider call was forced for this validation.

Trigger's production worker `20260825.3` still ran the six-hour Gmail import at
00:01 UTC on October 4. The schedule is declarative and could not be disabled
from the dashboard or imperative schedule API. Source commit `00546ba` removed
the `scheduled-sync-gmail` task but retained the manual `sync-gmail-inbox`
task. Trigger dry-run built without the scheduled task; typechecks, 36 tests,
Biome, and the server build passed. Production deployment `20261004.1`
completed with five registered tasks and no `scheduled-sync-gmail`. Trigger
reported zero executing runs after deployment. A later check after the former
06:00 UTC slot should confirm no new scheduled Gmail run. The old Trigger
banking schedule remains inactive. Manual Trigger tasks and the project still
exist and need separate retirement.

With automatic Gmail import removed, a second private bucket export was saved
at `/Users/christian/.local/share/bank-data/backups/2026-10-04-task-10-bucket`.
It has directory mode `0700`, object files mode `0600`, 154 objects and
21,144,232 bytes. Its manifest SHA-256 is
`6045618748d0a22240afa746bd9edc2f076c1ee49e4ba945a628cd8db715a01e`.
All 153 objects from the October 3 archive are still present with identical
sizes and content hashes. The one new object accounts for the new attachment
record. Every archived file passed a fresh SHA-256 check. A digest over the
sorted registered object key hashes and byte sizes matched a fresh production
query across all 132 attachment records, with 132 distinct storage keys. All
148 content hashes already recorded in `bookkeeper-os` still matched. The other
22 objects remain unregistered. This is a complete private recovery copy;
the live bucket and database attachment links remain intact until document
access has a verified long-term home.

Railway HTTP logs showed zero requests to the old `web` service from October 3
through the October 4 retirement. New bank consent and read paths are served
by `mcp`. Commit `17a968e` removed `web` from `.railway/railway.ts`. The pinned
production plan had exactly one destructive action, `Delete service web`, with
zero diagnostics and no staged patch. Its current and desired graphs both
retained `database.Postgres`, its existing volume, `service.mcp`,
`service.bank-sync`, and `bucket.bucket`. After the reviewed apply, live
Railway inventory had only those three services plus the volume and bucket;
all three service deployments reported `SUCCESS`. A fresh IaC plan returned
`No changes`, zero actions and diagnostics. An authenticated all-bank account
and totals read still returned five connected groups and 2,781 booked rows.

The tracked legacy `apps/web`, `src/auth`, and `src/ui` source was removed after
the service retirement. Root scripts and README now build and run the MCP and
sync entry points without the old web app. Typecheck, all 36 active tests,
Biome, server build, and Drizzle check passed. The Drizzle schema, migrations,
production database, bucket, and historical attachment links were not changed.
The remaining Task 10 work is to retire the manual Trigger tasks and project,
remove the personal semantic search tool before deleting its Cloudflare worker,
remove unused invoice and storage code after document handoff, and decide when
the bucket can be retired without losing document access.

## Task 10: bucket archive and live retirement inventory

The production Railway environment still has four live services: `mcp`,
`bank-sync`, `Postgres`, and `web`. The existing 5 GB Postgres volume remains
mounted at `/var/lib/postgresql/data`; the bucket is live. All four latest
deployments report `SUCCESS`. Railway reports no staged changes. A fresh
`railway config plan --json --detailed-exit-code` against the unchanged IaC
returned `No changes`, zero actions and diagnostics, and no staged patch. Its
current and desired graphs contain the same six resource addresses, including
Postgres, its volume, and the bucket. This is a baseline, not a deletion plan.

The production Trigger worker is version `20260825.3` and still registers six
legacy tasks. The banking schedule is inactive, but the six-hour Gmail import
remains active. Its October 3 06:01 UTC run completed. Railway HTTP logs for
the old web service contain 102 requests on October 1 and 2; the latest was
October 2 16:20 UTC. The source still contains Gmail and invoice processing,
attachment tools and storage access, and the separate personal search worker.
The MCP `allBanks` bank reads do not require that worker, but document access
still depends on the bucket. Preserve the bucket until its long-term document
path is verified. The next unattended `bank-sync` after Task 14 is due on
October 4 at 02:00 UTC.

A private local archive of every bucket object is at
`/Users/christian/.local/share/bank-data/backups/2026-10-03-task-10-bucket`.
It has directory mode `0700`, object and manifest file mode `0600`, 153 objects,
and 21,065,969 bytes. `manifest.jsonl` records each key, byte count, content
type, and SHA-256; its own SHA-256 is
`366a3f5a1ad8417145f27f8c9cca45c8beb69c4270f22312273fc09fc0aadb0c`.
The export used `scripts/archive-railway-bucket.mjs` with production bucket
variables passed only to the local process. It did not log credentials, keys,
filenames, or document contents. A second local pass read and hashed all 153
archived files. Every key and size matched `bookkeeper-os`'s 153-row
`bucket-objekt.csv`; all 148 previously recorded content hashes matched.
There were zero missing rows, size differences, digest differences, or file
permission differences. The metadata identifies 131 registered attachments
and 22 objects without an attachment row. This archive is a recovery copy,
not yet a verified replacement for live document access. The production bucket
and all attachment records remain untouched.

Before retirement, verify the first post-Task-14 bank sync and complete the
document handoff. Stop the old Gmail import before taking a final incremental
bucket snapshot so its archived object set cannot drift. Then review a fresh
IaC deletion plan resource by resource: keep Postgres, its volume, `mcp`, and
`bank-sync`; delete `web` only after its routes and domains have no remaining
consumers. Retire the Trigger worker and the personal search worker after
their live schedules and callers are accounted for. Remove obsolete source
code and variables without dropping historical database tables or attachment
links. Keep the bucket until long-term document access and manifest checks
pass. No retirement change has been applied yet.

## Task 14: isolated deletion rehearsal and production gate

Task 09 is complete: the October 3 unattended sync and scheduled Executor
read verified five connected account groups and 2,780 distinct booked rows.
A new custom-format production dump, newer than that sync, is at
`/Users/christian/.local/share/bank-data/backups/2026-10-03-pre-task-14.dump`.
It is mode `0600`, 3,945,215 bytes, with SHA-256
`6576c34492b64bf33a93242040b08eda243e0ce28103e78c90d4b90f86eb767a`.
The private local PostgreSQL 18 restore completed without error and contains
2,780 distinct booked IDs, 131 attachment rows, and the 15 existing Drizzle
migrations. Never restore it over the Railway Postgres service.

Migration `0015` changes the historical account and transaction references to
nullable foreign keys with `ON DELETE SET NULL`. Selected-account reads now
include detached historical sources and prefer a connected source for balance
and freshness. A guarded deletion script requires exactly eight disconnected
connections, five dependent accounts, 2,078 dependent booked transactions,
99 transaction-linked attachments, three connected connections, 2,780 total
booked rows, zero pending rows, and 131 attachment rows. It locks the relevant
tables, snapshots all account, transaction, attachment, and surviving
connection rows, and compares them after deletion in one transaction. Any
changed precondition or preservation mismatch aborts the transaction.

On the isolated restore, the Drizzle migrator advanced from 15 to 16 journal
rows. The guarded deletion removed eight disconnected connections and detached
the five accounts and 2,078 transactions. It preserved all 11 account rows,
2,780 booked transactions, 131 attachment rows, every account/transaction ID,
all other row fields, and every attachment link. A second execution correctly
failed its precondition guard. With the production encryption key supplied
only to the local process, the restored post-deletion all-bank service returned
five `connected` groups and 2,780 booked rows. Its account, full transaction,
and grouped total SHA-256 digests matched an authenticated production MCP
baseline exactly. No transaction text, IDs, amounts, secrets, or attachment
contents were printed.

A fresh `railway config plan --json --detailed-exit-code` reported `No changes`,
zero change-set actions and diagnostics, and no staged patch. Its current and
desired graphs both include `database.Postgres`, the Postgres volume, `mcp`,
`bank-sync`, `web`, and the bucket. A fresh bucket inventory has 153 objects:
131 registered attachment objects and the same 22 unregistered objects;
none of the registered files are missing or differ in size. Neither the bucket
nor any attachment row is part of the connection deletion.

### Production connection retirement

Commit `6093f5c` deployed successfully to both the MCP and `bank-sync`
services. Immediately before the database change, production still had the
reviewed 8 disconnected and 3 connected connections, 5 accounts and 2,078
booked transactions dependent on disconnected connections, 99 attachments
linked to those transactions, 2,780 booked transactions overall, and 131
attachments. The Drizzle migrator applied `0015`, advancing the production
journal from 15 to 16 rows. A complete authenticated MCP read after this
schema change still matched the pre-change account, transaction, and exact
grouped-total digests.

The guarded SQL script ran against production Postgres with `psql
--single-transaction` and returned `DELETE 8`; every in-transaction
preservation check passed. A fresh database read found exactly 3 connected
connections and 0 disconnected ones. All 11 account rows remain, with 5
historical rows now detached from obsolete connection IDs. All 2,780 booked
transactions remain with 2,780 distinct database IDs and 2,780 distinct
internal IDs; 2,078 historical transactions now have a null connection ID but
retain their original account IDs and all other fields. All 131 attachment
rows remain, including 99 linked to those historical transactions. The three
active connection records were unchanged.

A second complete authenticated MCP traversal after deletion returned the
same 5 `connected` account groups, 2,780 booked transactions, and grouped
totals. Account, transaction, and total SHA-256 digests were identical before
schema change, after schema change, and after connection deletion. The
follow-up bucket inventory still found 153 objects, with all 131 registered
objects present at the expected sizes and the same 22 unregistered objects.
Railway reports successful MCP, `bank-sync`, and Postgres deployments; the
next unattended sync is scheduled for 2026-10-04 02:00 UTC and has not yet
run after this cleanup. No extra provider sync was triggered. The temporary
local restore was stopped and removed; the private production dump remains.

## Task 09: scheduled Executor read and final acceptance

The scheduled `verify-hidden-village-bank-migration` heartbeat resumed the
coordinating chat at 02:41:30 UTC on October 3 without a new user prompt. That
chat sent this Task 09 follow-up. The previously user-owned
`hidden_village_bank` Executor connection was retired in Task 13; current
inventory has one authorized `bank_data.org.allBanks` connection. This
scheduled continuation used that connection for the first unattended,
read-only bank validation workflow. No Enable Banking provider call, token
transfer, account mutation, or transaction-content export occurred.

The Executor account call returned five selected groups: one personal Nordea,
two personal Revolut, and two business SEB. All five reported `connected`.
Their last successful sync times were between 02:00:25 and 02:00:34 UTC on
October 3. A complete all-bank cursor traversal used limit 200 and returned
13 pages of 200 plus one page of 180, for 2,780 distinct booked IDs. Every
row belonged to one of the five selected account groups and its returned
bank/workspace scope. No cursor repeated, and the last page reported
`incompletePage=false` with no continuation cursor. Page-level exact
two-decimal credits, negative debits, and net matched the independent
`summarize_all_bank_transactions` response for each bank, workspace kind, and
currency. The counts were 1,959 Nordea, 597 Revolut, and 224 SEB, all SEK.
Amounts, transaction IDs, account IDs, and transaction text were compared
inside the Executor call and omitted from this record.

For the inclusive UTC window 2026-10-01 through 2026-10-03, the Executor
totals and complete one-page transaction read agreed on nine unique booked
rows and exact amounts: five Nordea and four SEB, all SEK. Per-account SEB
checks found zero and four rows respectively, with complete pages, selected
account scope, and matching exact totals. This is a read-only stored-data
check, not evidence that every future provider transaction has already been
imported.

The Railway deployment that served the 02:00 UTC schedule started its
container at 02:00:25 and emitted a structured completion record at
02:00:45. That record reports three synced connections, five synced accounts,
69 transaction upserts, 26 historical overlaps skipped, zero booking-date
drifts, zero deferred connections, and no error. Upserts are processed rows,
not 69 new booked rows. Railway's available deploy logs contain only `info`
entries and no explicit numeric process exit code. The deployment was
subsequently replaced by a newer successful deployment at 02:51 UTC. Railway
now schedules the next cron for 2026-10-04 02:00 UTC. The completion log and
persisted results are the available run-success evidence.

A fresh read-only production query found 2,780 booked rows, 2,780 distinct
database IDs, 2,780 distinct internal IDs, and zero pending rows. The active
SEB connection is `connected`, its error is null, its `lastSyncedAt` advanced
to 02:00:25 UTC, and it holds 96 booked rows. The older disconnected SEB
source retains 128 historical rows. The previous 429 update was at 10:13 UTC
on October 2, more than six hours before this run. Zero deferred connections
was therefore expected; this production run exercised the allowed-retry path,
not the guard's skip path. The six-hour skip boundary remains covered by the
Task 09 source tests recorded below. No extra provider sync was started.

The bounded snapshot comparison, consent renewal, restore test, Railway cron
recovery, and first scheduled Executor read-only workflow now meet Task 09's
acceptance checks. Task 10 cleanup remains separate and subject to the
protected-Postgres cutover rules.

## Task 09: unattended SEB recovery on October 3

Railway's scheduled `bank-sync` container started at 02:00:25 UTC from the
deployed `8162994` source. Its structured completion log reported three
synced connections, five accounts, zero deferred connections, and no error.
A read-only production query confirmed the active SEB connection
`bda879c6-a0e0-4746-8b4e-6356d3a80f3d` is `connected`, has
`lastSyncedAt=2026-10-03 02:00:25 UTC`, and has a null `errorMessage`.
The renewed connection holds 96 booked rows, up from 94 before this run.

An authenticated Executor call to the production `bank_data.org.allBanks`
connection returned five selected account groups. Both business SEB groups
reported `connected` and the same 02:00:25 UTC freshness. The booked summary
returned 1,959 Nordea, 597 Revolut, and 224 SEB rows in SEK, totaling 2,780.
The pre-run baseline was 1,957 + 597 + 222 = 2,776; the new run added two
Nordea and two SEB rows while retaining the historical SEB rows. A business
SEB summary for 2026-10-01 through 2026-10-03 found four booked rows.
These were read-only checks; no extra Enable Banking fetch was triggered.

The unattended Railway sync and SEB status recovery gates were satisfied at
this point. Task 09 still required the first scheduled Executor bookkeeping
workflow. The MCP freshness and booked counts established
the stored-data baseline for that workflow; they do not prove that a future
unbooked bank transaction has already appeared. Do not run an extra provider
sync merely for acceptance. The separate recurring SEB recovery heartbeat
can be paused now that `connected` and MCP freshness are verified.

## Task 09: SEB rate-limit investigation on October 2

Railway production has one `bank-sync` service with a daily `0 2 * * *` UTC
schedule and a `pnpm start:sync` entry point. Its deploy log shows a container
start at 02:03:41 UTC, followed by an Enable Banking 429 with
`ASPSP_RATE_LIMIT_EXCEEDED` for the active business connection at 02:04:11 UTC.
The overall process exited 1. The later documented user-requested run inside
the MCP container at 10:13 UTC again received 429. A 15:18 UTC read-only
production query found that connection still in `error`, last successful sync
at 01:01:29 UTC, error update at 10:13:31 UTC, and consent valid until
2026-11-22 07:53 UTC. Its two included accounts retain 94 booked rows; the
historical disconnected SEB source retains another 128. No provider request
was made during this investigation. The initial incident report's 08:13 UTC
snapshot has been superseded by the later database update; Railway's
`bank-sync` logs do not show a run at 08:13 UTC.

The current Railway path uses two locally stored accounts, so it does not need
`GET /sessions/{id}` for this connection. For each account it requests
`GET /accounts/{id}/balances` and
`GET /accounts/{id}/transactions?date_from=2026-09-18&strategy=default&transaction_status=BOOK`.
The transaction API can add continuation pages. A full two-account run needs
at least four account-data requests, plus any continuation pages;
the local archive holds only 12 booked rows in this overlap window, but the
provider's page boundaries are unknown. The old code started balances and
transactions concurrently for each account. A 429 in one request could leave
the other running. Railway's application log records the provider error and
connection, not the failing endpoint or request count, so it cannot prove
which endpoint received the historical 429. It also cannot prove whether an
external client consumed the bank's quota.

`src/jobs/tasks/sync-banking.ts` is a second possible path: its daily Trigger
schedule is recorded as inactive in Task 06, while the old web manual sync and
personal account-inclusion actions can still trigger it. Unlike the Railway
path, it has no six-hour guard and requests account details, balances, and
transactions concurrently; Trigger has up to three task attempts configured.
No Trigger execution was evidenced in the Railway logs, and its remote run
history was not available here. Keep its schedule inactive and avoid manual
Trigger or Railway syncs while the SEB limit is active. The current Railway
path has no cross-process lock, so an overlapping explicit Trigger/manual run
remains a risk.

Enable Banking's FAQ attributes this error to the ASPSP's background-fetch
limit and recommends retrying after six hours. The repeated 429 after a
six-hour wait means this is not proven to be a one-off window. Valid consent
and HTTP 429 give no basis for reauthorization. The Railway source now treats
every HTTP 429 as non-retryable within the run and defers a background retry
for six hours from the recorded error. The Railway path now fetches balances before
transactions, stopping before the second request when balances gets 429. A
successful complete connection sync writes `connected`, clears `errorMessage`,
and advances `lastSyncedAt`; this is code-verified, not yet live-verified for
SEB. The next scheduled run remains 2026-10-03 02:00 UTC. Task 09 stays open
until that unattended run, the active SEB connection's recovery, and an MCP
freshness read are observed. If 429 persists after that run, obtain request
counts and quota details from Enable Banking/SEB before another attempt.

Validation of this source change: `pnpm test` passed 35 tests with one skipped,
`pnpm typecheck`, `pnpm check`, and `pnpm build:server` passed. The bank-sync
tests cover both provider-coded and generic HTTP 429, one attempt per 429,
and the exact six-hour deferral boundary. No live bank call was part of these
checks.

## Task 14: October 2 baseline before stale-connection cleanup

The user wants to delete the old disconnected bank connections and ultimately
retire the web app, Trigger.dev jobs, and invoice/storage logic. At this
baseline, production cleanup had not started. The unattended bank sync and SEB
recovery passed on October 3; the scheduled Executor read and connection
retirement subsequently passed as recorded above.
Do not delete the active SEB connection or repeat its provider fetch merely for
cleanup.

Read-only production SQL found 2,776 distinct booked transactions: 1,950 on a
disconnected personal Nordea source, 7 on its renewed connection, 597 on the
other active personal connection, 128 on a disconnected business SEB source,
and 94 on the renewed business connection. The historical SEB account with
128 rows matches exactly one renewed SEB account by normalized IBAN and
currency; the second historical SEB account with zero rows likewise matches
one renewed account. The 128-row historical source has 99 linked attachment
records. All 2,776 booked rows must remain readable, and their transaction
IDs and attachment links must survive physical connection removal.

Deleting either historical connection under the current schema would cascade
to its account and transaction rows. This is why a plain connection DELETE is
unsafe. The read-only MCP account grouping now uses normalized business IBAN
and currency, as it already does for personal renewals. The active source
supplies balance and freshness, while both source account IDs stay in the
transaction query. This removes the duplicate disconnected SEB account entries
from the MCP presentation; it does not alter database rows or clear the active
SEB rate-limit error. Commit `2cedd7a` deployed successfully to both `mcp`
and `bank-sync`. An authenticated production all-bank MCP read returned five
account groups: one Nordea, two Revolut, and two SEB. The tool's booked totals
remained 1,957 Nordea + 597 Revolut + 222 SEB = 2,776. Paginating both SEB
account groups returned 222 unique booked rows in one group and zero in the
other. Both SEB groups still report the current active connection's `error`
status. No provider sync was triggered by these reads.

The prior locally documented dump was unavailable on this machine. A fresh
custom-format production dump was streamed to
`/Users/christian/.local/share/bank-data/backups/2026-10-02-pre-connection-cleanup.dump`
outside the repository. Its file mode is `0600`, size 3,941,367 bytes, and
SHA-256 is
`73a4256ae91be729339a1fc7cc913042b47db5abf0fe855e383da6c183da63c2`.
`pg_restore --list` read the archive catalog successfully. A full isolated
restore of this new dump has not yet been performed on this machine, so it is
not the final deletion gate. The dump contains sensitive production data.

The production attachment table has 129 rows, all in the business workspace:
122 matched and linked to transactions, 6 unmatched, and 1 ignored. Their
registered S3 objects all exist with the expected byte sizes. Read-only bucket
inventory found 151 objects totaling 20,853,940 bytes. The other 22 objects
have no attachment row: 19 PDFs and 3 PNGs totaling 1,812,681 bytes. Content
hashes reveal five distinct orphan contents; one is already present among
registered attachments, while four distinct contents exist only among the
orphans (15 object copies). File contents, names, transaction details, and
credentials were not printed or changed. Treat the four unique orphan
contents and six unmatched records as review candidates, not as valid invoice
matches. Keep the bucket until the attachments and transaction-link manifest
have been exported and verified in their long-term home.

Before physical deletion, test a fresh restore in isolation, prepare a schema
and data migration that detaches historical accounts and transactions from
their obsolete connection FKs without changing booked rows or attachment
references, then compare all-bank MCP IDs and exact totals before and after.
Only after Task 09's sync gate and this preservation check should the old
connection rows be removed. Retire the app, Trigger.dev, and bucket separately
under Task 10 after the attachment archive has been verified.

## Task 09: user-requested manual sync retry

At 10:13 UTC on October 2, more than eight hours after the prior SEB 429,
the user requested another sync attempt. A single `node dist/sync.js` process
ran inside the live Railway MCP container through SSH, using its production
variables and private database connection. The `bank-sync` cron configuration
was not changed, and no concurrent cron execution was observed. This was a
manual run, not proof of unattended cron execution.

Nordea and Revolut completed successfully. Their MCP `lastSyncedAt` values
advanced to 10:13:31 and 10:13:35 UTC. The SEB connection returned HTTP 429
`ASPSP_RATE_LIMIT_EXCEEDED` again, so the overall command exited with code 1.
A read-only database check confirmed one connection in `error`, with its last
successful sync still at 01:01:29 UTC, the new error recorded at 10:13:31 UTC,
and consent valid through 2026-11-22. The two selected SEB accounts on this
connection therefore still show `error`; two other selected SEB accounts are
on an older disconnected connection. The fresh all-bank MCP totals still count
1,957 Nordea, 597 Revolut, and 222 SEB stored booked rows. Those aggregate
counts were unchanged; provider completeness remains unverified while SEB is
rate-limited.

Do not retry immediately. The six-hour background-fetch guard now uses the
new error time, and the next daily Railway cron remains scheduled for
2026-10-03 02:00 UTC. Task 09 remains in progress until that run and the
unattended client read are observed.

## Task 13: retire the old Executor bank integration

The user requested removal of the old Executor entry after checking that the
new Bank Data connection was correct. Executor's `bank_data` integration uses
streamable HTTP at `https://bank-data-mcp.up.railway.app/mcp`. Its only saved
connection, `tools.bank_data.org.allBanks`, was healthy and returned the same
booked counts and exact amount aggregates as the old all-bank connection:
1,957 Nordea, 597 Revolut, and 222 SEB rows across seven selected account
groups. This comparison used live Executor tool calls, not a database change.

Removed the `hidden_village_bank` catalog integration. Its three connections
(`allBanks`, `bankPersonal2`, and `hiddenVillageBusinessBank`) disappeared from
Executor's saved-connection inventory. Removed all 11 policies tied to the
old business connection; a fresh policy read found no old integration
patterns. The catalog now lists only `bank_data` among these two integrations.
After removal, its account and totals tools still succeeded with seven groups
and 2,776 stored booked rows. The old Executor tool addresses no longer work;
any consumer still using one must switch to `tools.bank_data.org.allBanks`.
No MCP credential value, bank consent, Railway resource, database row, or
direct Raycast entry was changed. Task 09's unattended sync gate remains open.

## Task 09: bounded bank comparison and unattended gates

The checkout began clean at `bcefc73` and matched the freshly fetched remote
branch. The plan ledger records Task 09 as in progress. Fresh Railway status
still lists the existing Postgres service
`404f6fb9-da37-403f-b1f3-e8d6e2c54d60`, MCP, web, and
`bank-sync`. Postgres remained on its existing successful deployment. The
latest MCP and bank-sync deployments reported `SUCCESS` from `bcefc73`.
The bank-sync configuration remains `0 2 * * *` in UTC with restart policy
`NEVER`, and Railway reports `nextCronRunAt=2026-10-03T02:00:00Z`. Its newest
deployment has no execution logs as of 05:32 UTC on October 2. This verifies
configuration and schedule state, not the next container start or a successful
unattended import. No provider fetch was forced during the ASPSP limit window.

The retained pre-Task-06 dump remains mode `0600`, 3,935,929 bytes, and its
SHA-256 still matches the recorded
`4a25a4753bc1639cd50205c2da0422247c6b458a94485d194092a79bd2dee28c`.
It restored without error into a new disposable PostgreSQL 18 container. The
restored snapshot has 2,769 booked transaction rows, 2,769 distinct row IDs,
2,769 distinct internal IDs, zero pending transaction rows, and 15 Drizzle
migrations. Read-only production SQL now has 2,776 booked rows, 2,776 distinct
row and internal IDs, and zero pending rows. The seven-row delta is on the
renewed personal source account. The disposable restore was never pointed at
Railway Postgres.

For the company comparison, four selected account rows were sorted by their
internal IDs and labeled 1 through 4 only for this check. The windows were
inclusive UTC dates 2026-02-01 through 2026-08-31 (W1) and 2026-09-01 through
2026-10-01 (W2). The restored snapshot and current production SQL independently
grouped booked rows by account and original currency, with exact two-decimal
credits, negative debits, and net. The authenticated Executor connection then
called `summarize_bank_transactions` and `list_bank_transactions` for each
account and window. Each transaction page used limit 200, contained every
matching row, had unique IDs, and ended without a continuation cursor. The
page amounts independently summed to the SQL and Executor summary amounts.
Exact amount values and account IDs were compared in memory and were not
written to this document.

| Account label | W1 SEK rows | W2 SEK rows | Snapshot, live SQL, Executor totals, and Executor pages |
| --- | ---: | ---: | --- |
| 1 | 71 | 23 | Counts, credits, debits, and net match exactly |
| 2 | 0 | 0 | Empty totals and pages match |
| 3 | 128 | 0 | Counts, credits, debits, and net match exactly |
| 4 | 0 | 0 | Empty totals and pages match |

All 222 selected company booked rows fall in those two windows. Every window
had one currency, SEK. The two account rows marked `error` are on the same
company connection, whose last successful sync was 2026-10-02 01:01 UTC and
whose last error update was 02:04 UTC. The classified error is the bank's
`ASPSP_RATE_LIMIT_EXCEEDED`. The two `disconnected` account rows share a
different connection, last synced in August; one retains 128 booked historical
rows. Four account statuses therefore represent two connection statuses, not
four independent authorization failures. Neither state was changed.

For personal source rows, the same restored snapshot and production database
were compared over 2026-09-01 through 2026-09-30 and 2026-10-01 through
2026-10-02. Three existing selected source accounts had unchanged SEK counts
and exact credit, debit, and net totals in both windows. The renewed source
account had zero rows in the snapshot and seven in production: four in
September and three in October. A fresh production read confirms the renewed
connection is `connected` with one selected account and a future consent end,
while its intended predecessor is `disconnected` and still holds 1,950
included booked rows. The other personal connection remains `connected`.
The real provider callback and account-selection save were already verified
in Task 05; this check confirms their persisted outcome, not a second bank
authorization.

The Executor connection passed the bounded reads above during an attended
session. No matching scheduled automation was found locally, and Executor's
available bank integration exposes read tools but no scheduler. The first
unattended Executor workflow has therefore not run. A scheduled continuation
after the October 3 cron should use this same user-owned Executor connection
to read account freshness and bounded totals, compare the 222-row baseline
and unique IDs, and report only status, counts, currencies, and equality of
amount aggregates. It must distinguish stored-history reads from fresh bank
sync. Task 09 remains in progress until both that unattended read and the
Railway cron run are actually observed, including recovery of the limited
connection to `connected` or a documented provider failure. Do not manually
retry that provider connection merely to satisfy the check.

## Task 08: Executor and Raycast bank read acceptance

The checkout began clean at `ffcef56`, matching
`origin/codex/bank-mcp-migration`. The plan ledger records status. No
application source, bank row, Railway resource, database setting, or existing
bearer value was changed.

Executor on the home Mac was reachable through its existing connected MCP
route. Its live connection inventory had no Hidden Village bank entry. A probe
of `https://hidden-village-mcp.up.railway.app/mcp` reported bearer
authentication required and no OAuth requirement. The new Executor catalog
integration `hidden_village_bank` uses streamable HTTP and an Authorization
bearer template. After the user explicitly approved transferring the existing
production `MCP_API_TOKEN` from Railway's `mcp` service, the token was pasted
through a secure Executor form without printing its value, then the local
clipboard was cleared. That form initially created an org-owned connection
despite `owner=user` in its handoff URL. A user-owned connection was created
from the same provider credential reference, its authenticated read passed,
and the temporary org connection was removed. Fresh inventory contains only
`tools.hidden_village_bank.user.hiddenVillageBusinessBank`. The file provider
still labels the retained credential item with its original org namespace;
there is no org-owned connection. No token value is present in task notes or
chat.

The first 11 Executor block policies used a wildcard in the middle of the
address and did not enforce. They were removed. The final 11 org guardrail
policies match full addresses under
`hidden_village_bank.user.hiddenVillageBusinessBank` and block the legacy
overview, transaction search, attachment read, and attachment mutation tools.
A real `get_finance_overview` call returned `tool_blocked` after the temporary
org connection was removed. The three permitted tools are
`list_bank_accounts`, `list_bank_transactions`, and
`summarize_bank_transactions`. This is an Executor client policy. The business
bearer still reaches legacy tools through the MCP server directly, so it is
not a server-side bank-only token.

A direct authenticated HTTP client on this Mac read all selected company
transactions with limit 50: five pages of 50, 50, 50, 50, and 22 rows. All
222 returned IDs were unique, the final page reported completion, and the
sum of the bank totals counts was also 222. Four selected company accounts
were returned. The authenticated Executor connection independently repeated
the complete cursor traversal: the same five page sizes and 222 unique IDs,
with all rows booked and all account IDs in its four selected accounts. Its
per-currency row counts matched `summarize_bank_transactions`, the final page
reported completion, and no cursor repeated. The account read reported two
connections in `error` and two `disconnected`. These are data freshness
signals for Task 09, not a failure of stored-history reads. No transaction
content, account IDs, balances, token values, or cursor values were printed.

Railway's MCP deploy logs from 05:18 UTC onward contained 11 structured
`bank_mcp_read` events: five account reads, one totals read, and five page
reads. Logged filter fields were limited to `hasAccountFilter`, `hasCursor`,
and `limit`; no raw account ID or cursor value was present.

Raycast on this Mac already has `Personal Finance`, `Executor`, and an older
direct `Hidden Village` MCP entry. Starting `Personal Finance` refreshed its
tool list to include all three new bank reads. In Raycast AI Chat, actual
authenticated `List selected bank accounts` returned three selected accounts,
all connected. An actual `List booked bank transactions` call with limit 2
returned two rows, `incompletePage=true`, and a continuation cursor. The
chat was instructed to report counts only, though an earlier automatically
generated response also displayed balances in the local Raycast UI. Do not
repeat those values in task output. The `Executor` Raycast entry starts and
shows its seven current tools. Before connection, Raycast `@executor` called
`connections.list` and correctly found zero bank connections. After
connection, Raycast `@executor` called the user-owned `list_bank_accounts`
tool. Its first AI-generated parser read `result.data.accounts` and falsely
reported zero, although the tool call succeeded. A corrected call required
`result.data.structuredContent.accounts` and returned four accounts, with two
in `error` and two `disconnected`. The corrected structured-content result is
the Raycast bank acceptance evidence; do not use the first summary.

The older direct `Hidden Village` Raycast entry is configured for the same
production MCP URL with no HTTP header in its editor. Starting it failed with
`Dynamic Client Registration rejected (HTTP 404)`, consistent with Raycast
attempting OAuth against the bearer-only MCP service. Its displayed tool list
is stale and lacks the Task 07 bank reads. No Raycast server configuration was
changed because the existing `Executor` and `Personal Finance` entries passed
the intended calls. Retire the stale direct entry during Task 10 cleanup
rather than add another broad bearer credential to Raycast. The intended Task
08 paths were Executor on the home Mac and Raycast on this Mac. Raycast on the
iPhone was not tested and was not required for this acceptance.

## Task 07: selected account read tools and stable renewal identity

The checkout began clean at `f52c38f`, matching the remote branch. The plan
ledger carries the task status. No database schema, migration, provider
request, account row, Railway resource, or consent setting was changed for
this task.

The business bearer token now offers three read-only bank tools alongside
the existing business tools. A personal workspace token offers the same
three tools alongside the existing personal tools. The dedicated bank-consent
token cannot see bank data tools. `list_bank_accounts` returns every selected
account in the authorized workspace, including selected company accounts on
disconnected connections that retain history. It reports the latest known
balances, connection status, last successful sync, and response time. The
service never returns an IBAN or provider payload. `list_bank_transactions`
accepts account and inclusive UTC date filters, pages newest first using a
cursor, caps each page at 200, and reports `incompletePage`, `nextCursor`,
response time, and per-account connection freshness. `summarize_bank_transactions`
uses the same account and date filters and returns exact database decimal
credits, negative debits, net amounts, and counts by currency. Both reads
require `status=booked`; the existing personal search and spending summary
now apply the same predicate.

Personal rows with matching decrypted IBAN and currency inside one workspace
are one presented account. The oldest selected source row supplies the stable
public account ID; all source row IDs remain accepted as filter aliases.
The currently connected row supplies balance and last-sync state, while an
old name override remains the display name. The old and renewed database
rows and their transaction histories stay intact. Grouping occurs only in
memory after workspace and selection filtering. Company accounts are never
merged by name. If an older source row is later deselected, its public ID
could change; preserve it as selected while it is the historical archive.

Bank read calls write minimal audit details. Personal calls insert into the
existing `personal_mcp_audit` table with workspace and token IDs. Business
calls write structured Railway logs. Filter summaries contain dates, limit,
and booleans for account and cursor filters, not account IDs, cursor values,
transaction content, IBANs, or decrypted payloads. Failed operations use a
generic log marker. Railway log retention is not a durable business audit
store and should be revisited if persistent business audit evidence is needed.

### Validation and limits

The Task 06 backup was restored into a disposable local PostgreSQL 18
container, then modified only inside that disposable database with one booked
and one pending synthetic row on the renewed personal account. Its real
encrypted account and transaction payloads remained decryptable with the MCP
service key. Authenticated HTTP MCP calls against that restore confirmed:

- An invalid token gets HTTP 401; the consent token lists no bank read tools.
- The personal token sees one presented account for the old and renewed rows,
  with the old stable ID and old name override. The active row supplies the
  current balance and sync status.
- A one-row page on the renewed account continues with a cursor into old
  history. Both old and new source IDs select the same account and return the
  stable public ID. The synthetic pending row is absent from the new page,
  the existing personal search, and the booked totals.
- The business token sees the selected company accounts, including retained
  disconnected history, and a multi-page booked read. It does not see the
  personal account. Personal audit rows were written; business read events
  appeared as structured logs without account identifiers.

The disposable container and one-off verification script were removed after
the checks. A committed regression test covers stable personal identity,
active balance and freshness, the old name override, and separate company
accounts. `pnpm test` passed with 31 tests and one pre-existing skip;
`pnpm check`, `pnpm typecheck`, `pnpm build:server`, and `pnpm test:smoke`
passed. No complete
production MCP transaction retrieval from Executor or the intended devices
was attempted here; Task 08 owns that acceptance. `incompletePage` means
more stored booked rows match the query, not that provider history is complete.
Connection freshness exposes a stale or disconnected source but cannot prove
that all provider transactions were imported. Task 09 owns the unattended
cron and provider comparison.

### Live publication and bounded MCP read

The host's GitHub HTTPS push failed because its keychain credential could not
be read, and `gh` had an invalid local token. The connected GitHub API
published commit `5beecc0` on the branch as a fast-forward from `f52c38f`.
Its tree hash `13546a5` exactly matched the tested local commit `6529dd4`.
The checkout was aligned to the remote commit and clean. Railway reported
`SUCCESS` deployments of `mcp` and `bank-sync` from `5beecc0`; the existing
Postgres service remained `SUCCESS`. This was a source redeployment, not an
infrastructure apply or database migration.

An authenticated live business MCP call returned four selected company
accounts. A one-row booked transaction page had a continuation cursor and
`incompletePage=true`; the per-account freshness array covered all four.
Booked totals across the selected company accounts counted 222 stored rows.
Per-account totals confirmed that one selected disconnected account still
exposes 128 historical booked rows. Nine structured `bank_mcp_read` audit
events for account, page, and total tools were present in Railway deploy logs
without account-identifier fields. No account names, IDs, IBANs, transaction
content, token values, or connection strings were printed in the verification
output.

The live freshness read showed the active company connection in `error`,
while a read-only Postgres query showed two personal connections in
`connected`. The company error was last updated at 02:04:07 UTC with the
ASPSP rate-limit category, before the Task 07 deployment began at 02:20 UTC.
This corrects the earlier Task 06 note that described the limited connection
as personal. The current error is provider-side freshness evidence, not a
failure of the new read tools. Task 09 still owns confirming the next
unattended bank-sync run and recovery after the six-hour backoff. A live
personal bearer token was not available for this task, so personal tool
authorization and grouped history were verified against the restored database
with an actual authenticated HTTP MCP client; Task 08 must verify the live
personal path from the intended device.

## Task 06: Railway bank sync deployed with a provider-limited first run

The checkout began clean at `f6ad675`, matched
`origin/codex/bank-mcp-migration`, and had full filesystem and network access
without approval prompts. This ledger carries Task 06 status. Fresh Railway
status still showed the protected Postgres service
`404f6fb9-da37-403f-b1f3-e8d6e2c54d60` and the
existing MCP, web, volume, and bucket. A fresh plan before edits reported no
changes. After adding `bank-sync`, the production plan reported exactly one
safe resource creation, zero diagnostics, and no changes to the five existing
resources. A pinned apply created only `bank-sync`, service
`0299c74f-e87c-41ea-9e5c-b5c4c5ee0816`, from tested commit `1231ba1`.
It used variable references to the existing Postgres and MCP services. The
new service build reached `SUCCESS`, with a daily schedule at 02:00 UTC.
Postgres, its volume, MCP, web, and the bucket were not changed by the
apply. Pushing the branch separately redeployed MCP from the same commit;
that deployment reached `SUCCESS`. Railway normalized the cron restart
policy to `NEVER`; the authoring file now states that value, and a fresh
production plan reports no changes and zero diagnostics.

A fresh production `pg_dump` was streamed into
`/Users/christian/.local/share/hidden-village/backups/2026-10-02-pre-task-06.dump`
without printing its contents. The file has mode `0600`, size 3,935,929
bytes, and SHA-256
`4a25a4753bc1639cd50205c2da0422247c6b458a94485d194092a79bd2dee28c`.
It restored without error into a disposable local PostgreSQL 18 container.
The restored snapshot had 11 bank connections, 11 bank accounts, 2,769 bank
transactions, and 15 Drizzle migrations. This backup contains sensitive data
and remains outside the repository. Never restore it over the Railway service.

The new `src/sync/bank-sync.ts` runs separately from Trigger.dev. It reads
connected and transient-error connections, retries provider reads, advances
`lastSyncedAt` only after each connection succeeds, exits after closing the
database client, and reports the latest success in its JSON result. Provider
pagination now rejects missing transaction arrays and repeated continuation
keys. The provider boundary still requests `BOOK` and excludes `PDNG`.
Duplicate provider references on a page are deduplicated before upsert.
Personal renewal matching uses the encrypted IBAN and currency within one
workspace. It retains the old account and transaction rows, copies its name
override to the new account, and skips transactions already present on the
old account. Ambiguous cross-consent matches fail without adding another row.
Stale MCP pending consent rows, including abandoned account-selection
sessions, are marked disconnected after 30 minutes; their rows are retained.

An isolated run used the restored local database and live Enable Banking
credentials for read-only provider requests. The first full run found a
cross-consent booking-date difference and one provider HTTP 429; neither
changed production. The date difference was caused by local-time parsing of
date-only provider values in the Swedish process timezone. Parsing now uses
UTC midnight, which matches the existing Railway data. The sync avoids an
unneeded account-details request and backs off longer for 429 responses.
A targeted rerun on the restored database succeeded: one renewed account,
seven new-account transaction upserts, 26 historical overlaps skipped, zero
booking-date drifts, and a recorded success time. Across local runs, all
three abandoned MCP pending attempts were marked disconnected. A safe local
comparison confirmed the old account still held 1,950 rows, the new account
held seven, the encrypted IBANs matched, and the old name override was copied.
The older account and its rows were not updated or removed. The initial full
run's other provider connection remained rate-limited, so a complete
all-connection run has not yet passed.

The old Trigger.dev banking run completed at 01:01:38 UTC on 2026-10-02.
Its schedule was then deactivated and read back as inactive, with zero active
banking runs, before the Railway service was created. The Trigger job code
remains available for rollback. The new cron uses UTC, so `0 2 * * *` runs at
03:00 CET or 04:00 CEST. Railway keeps the cron deployment idle between runs
and schedules the next container execution for 02:00 UTC each day.

With Trigger inactive, a bounded production import for only the renewed
personal account used the committed `dist/sync.js`, Railway production
variables, and the protected database through its public TCP proxy. This
manual local process is distinct from a Railway container run. It succeeded
with one connection and one account, seven new-account transaction upserts,
184 historical overlaps skipped, zero booking-date drifts, three abandoned
pending attempts expired, and a recorded success time. Read-only production
queries then confirmed 2,776 booked transactions, zero pending connections,
zero repeated internal IDs, seven rows on the renewed account, 1,950 rows
on the old account, and a recent `lastSyncedAt`. A separate safe comparison
of decrypted personal account payloads confirmed the old name override was
copied to the new row without revealing names or IBANs. The fresh backup
checksum still matched before the apply and manual run.

At 02:00 UTC on 2026-10-02, Railway advanced `nextCronRunAt` to 2026-10-03
02:00 UTC, but no container start was logged on the original deployment. A
from-source redeploy at 02:02 UTC started a Railway container at 02:03:41.
It exited nonzero at 02:04:11 because the business connection received
`ASPSP_RATE_LIMIT_EXCEEDED` (HTTP 429). This proves container startup and
the production entry point, but not a successful unattended cron import.
Read-only production checks after the run found 2,776 booked rows and 2,776
distinct internal IDs. Two active connections are `connected`; the limited
connection is `error`, retains 94 booked rows and its prior `lastSyncedAt`,
and remains eligible for the next sync. The old 1,950-row account and the new
seven-row account were retained. Enable Banking's
[FAQ](https://enablebanking.com/docs/faq/) identifies this error as an ASPSP
background-fetch limit and recommends waiting six hours. Immediate retries
for this specific error have now been removed from the source. A six-hour
background-fetch guard also defers recently synced or rate-limited
connections when a deployment starts the process before the next scheduled
run. Local tests confirm one provider call for this 429, and a read-only
evaluation against the three production connection timestamps confirmed that
all three would defer immediately after this run. The daily job will retry
the limited connection after 24 hours, while generic transient provider
failures still receive short backoff. Task 09 must confirm the next
successful unattended run, the provider-limited connection's recovery, and
stable database aggregates. Do not reactivate the Trigger schedule
concurrently.

## Task 05: live consent and renewal verified

### Final live outcome

The user opened the restricted recovery link on the phone, selected one
personal account, and saw `Bank connected. Your account selection was saved.`
Railway HTTP logs show selection GET 200 and POST 200 at 01:07:16 UTC on
2026-10-02. A read-only production query confirms the new personal connection
is `connected`, its provider session and encrypted payload are stored, its
consent is current, and `selectionCompleteAt` is recorded. Exactly one
discovered account is included. The intended previous connection is
`disconnected`; the other personal connection remains connected. The
restricted `get_bank_consent_status` MCP call returned HTTP 200 without an
error. The MCP health endpoint returned 200, and a fresh Railway plan reported
no changes across the five imported resources. The production dump still
matches its recorded SHA-256 checksum. No Postgres schema, web, bucket,
volume, provider application setting, or Raycast change was made in this
final verification.

A live Enable Banking GET for the stored session returned one account. The
selected provider account's details and balances were readable, and a
read-only seven-day booked transaction fetch returned 19 rows. The new local
account has zero transaction rows because Task 06 has not run the new sync.
The local personal finance read path returned one transaction on a one-row
page with another page available, so historical reads still work. This is
consent and provider-read acceptance, not a completed sync or cutover.

The renewed provider account UID differs from the previous UID, although
their encrypted IBANs, names, and currencies match. The old account still
holds 1,950 booked transactions and remains included to preserve historical
reads. The new account is also included, so the current personal account
list exposes both rows for the same real account. The old name override was
not carried to the new row. No new local transactions were inserted or
deleted, so there is no new transaction duplication yet. Do not remove the
old account or mark it excluded before Task 06 and Task 07 reconcile stable
account identity, history, and display settings. Three abandoned pending
consent attempts remain from the earlier failed browser flows; they were not
cleaned up during this verification. Task 06 should handle their safe expiry.

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
403 at 00:49:36 UTC. The earlier guard fix therefore had not solved the live
phone issue. A follow-up patch recorded only guard booleans and a phase label
on rejected POSTs, without IDs, cookies, request bodies, headers, or account
details. At that point the user retained the phone session while diagnostics
were deployed, and Task 05 remained blocked pending a live save and renewal.

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
At that point, this mobile flow fix still needed production deployment and
the user's live selection.

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

The callback was then made idempotent for future flows. The start operation
stores HMAC hashes of the authorization state, and successful completion adds
an HMAC hash of the one-time callback code. A repeated callback with the same
state and code can then return the already completed result without exchanging
the provider code again. A mismatched code still fails. The local integration
test verifies a repeated callback returns 303 with no second provider session,
and replay with a different code returns 400. The current Vivaldi flow began
before those hashes were stored, so its recovery depends on the cookie in
that same browser. Do not issue another bank authorization before checking
that recovery path.

The idempotent callback patch passed the full unit suite, the isolated
Postgres 18 consent integration, typechecks, Biome, root build, Drizzle check,
and MCP smoke test. The retained backup checksum matched again, and the
Railway plan had no infrastructure changes. It was pushed as commit `ea28af4`
with a tree identical to the tested local commit, and MCP deployment
`62fa6266-1a4a-442f-bfe6-f4820036de26` reached `SUCCESS` at 01:01:06 UTC.
The health endpoint returned 200. A read-only Enable Banking GET for the
stored provider session succeeded and reported one account. The source chat
asked the user to open `/banking/select` in the same Vivaldi browser before
the selection cookie expires around 01:11 UTC. At 01:02 UTC, that same
Vivaldi browser returned `Account selection expired`, so it did not send a
valid selection cookie on this GET. The callback response code path did set
the cookie on its successful 303, but Railway's HTTP logs do not expose
response headers or cookie acceptance. The evidence cannot distinguish
browser rejection from navigation timing or a later cookie loss. Do not infer
that the session failed: the database and provider still show one completed
pending consent and one account.

A restricted `recover_bank_selection` MCP operation was added for this
case. It accepts a bank name and country, then checks that the latest personal
pending consent is a recent completed renewal for that bank, that its prior
connection remains active, and that an account was discovered. It returns a
short-lived signed selection URL. The selection GET accepts that signed proof
without a cookie and renders a form with the proof and an HMAC CSRF token.
The POST already verifies both without a cookie; a foreign origin still fails.
The page has no external resources and retains `Cache-Control: no-store`,
`Referrer-Policy: no-referrer`, and its restrictive content security policy.
Local integration verified a cookie-less recovery GET and POST. The recovery
URL is a temporary bearer capability; do not paste it into logs or docs.
That step remained blocked until deployment and a live account selection save,
both of which are verified in the final outcome above.

The checkout was clean and
matched `origin/codex/bank-mcp-migration` at `491b3ea` on resumption. The
retained backup still had mode `0600` and its SHA-256 matched the recorded
value below. The then-latest MCP deployment
`6f951d8c-d69f-400b-84e8-40599573cb79` remained `SUCCESS`.

The clean branch matched `origin/codex/bank-mcp-migration` at `0e682ce`
after a fresh fetch. Tasks 01 through 04 were checked against this plan and
the checkout before editing. Filesystem and network access were effective,
with approval policy `never`. The Docs ledger records this task.

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
automatic approval was requested. This plan and notes remain the task ledger.

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
production-changing plan** until that gate is resolved.

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

The established Docs ledger records Task 02.

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

This plan and note carry the task status.

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
- The working plan and task ledger in `Docs/` let future agents pick up one
  slice at a time.
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

## 2026-10-02 all-bank Executor scope

The user prefers one Executor MCP connection that can read every selected bank
and identify which bank each transaction came from. Existing business and
personal tokens have separate scopes. The new optional `MCP_ALL_BANKS_TOKEN`
uses a dedicated MCP context with only three read-only tools:
`list_all_bank_accounts`, `list_all_bank_transactions`, and
`summarize_all_bank_transactions`. The existing business and personal tokens
retain their current tool sets. The all-bank token must be distinct from the
business and consent tokens and at least 32 characters long.

The service derives the personal workspace from the business workspace owner,
reads selected accounts from both workspaces, and labels each account and
transaction with `bankName` and `workspaceKind`. `bankName` comes from the
connection's Enable Banking ASPSP metadata, falling back to its display name.
The all-bank transaction query returns booked rows, decrypts personal display
fields, supports bank/account/date filters and cursor pagination, and exposes
connection status and last sync time. Totals group by bank, workspace, and
currency. These labels identify the bank; they are not spending categories.

A read-only run of the new local service against the production database found
one selected Nordea account group, two Revolut groups, and four SEB groups.
Their booked counts were Nordea 1,957, Revolut 597, and SEB 222, all in SEK.
The combined query traversed 2,776 unique rows in 14 pages of up to 200,
matching the totals exactly. One sampled transaction from each bank carried
the expected bank label. The SEB connections currently report error or
disconnected, but their stored booked history remains readable. All-bank MCP
tool scope, bank-name derivation, bearer token validation, the full test suite,
typechecks, Biome, and server build passed locally. No schema or database data
was changed for this scope.

The new code was pushed as `392b344` to `codex/bank-mcp-migration`, the branch
tracked by Railway's production `mcp` service. Railway deployed that commit,
then a 64-character random `MCP_ALL_BANKS_TOKEN` was set on the `mcp` service,
triggering a second successful deployment. The bearer value was never printed
or stored in the repository. An authenticated remote MCP call returned only the
three all-bank tools and the expected per-bank counts; the existing business
bearer did not expose those tools.

Executor's existing `hidden_village_bank` integration now has a healthy
`tools.hidden_village_bank.org.allBanks` connection. Its live
`list_all_bank_accounts` returned one Nordea, two Revolut, and four SEB selected
account groups. `summarize_all_bank_transactions` returned the same 1,957,
597, and 222 counts, and a Revolut-filtered five-row page labeled every row
Revolut and provided a continuation cursor. The existing `bank.personal` and
`bank.business` connections were retained because consumers may still address
their tools directly. This local Executor instance saved `allBanks` at `org`
scope despite a user-scoped add-account link; it runs on one person's machine.
Reassess that scope before any future shared or hosted Executor deployment.

The user clarified that "categorized" means separating transactions by source
bank and by personal versus business, rather than spending categories. The
all-bank transaction and totals tools now accept an explicit `workspaceKind`
filter in addition to `bankName` and `accountId`. Their descriptions tell
agents to discover available accounts first, and to avoid presenting an
unfiltered, time-ordered page as one bank statement.

The user also clarified that two Revolut accounts must remain distinct. Live
Executor `accountId`-filtered totals returned 459 booked rows for the personal
Revolut account and 138 for the shared Revolut account, summing to the 597
Revolut total. The tool descriptions now say that `bankName=Revolut` includes
both accounts and that an individual account needs its stable `accountId`.

After the user approved a refresh, Executor's `allBanks` tool schema exposed
the new `workspaceKind` filter. Live filtered totals returned 2,554 personal
and 222 business booked rows. A business-filtered request can therefore avoid
mixing SEB with personal Nordea and Revolut results.

The user logged into the current business Transactions page to continue an
apparent SEB renewal. The page showed a 429
`ASPSP_RATE_LIMIT_EXCEEDED` error, although its generic UI offered "Reconnect
bank." A read-only production DB query found one active business connection
with two included accounts, last successful sync 2026-10-02 01:01 UTC, and
consent valid until 2026-11-22 07:53 UTC. The other two business connections
are disconnected historical records, one with two included accounts and one
with no accounts. This is a rate-limited background fetch rather than an
expired authorization. No new consent was started. The bank-sync service is
scheduled for 02:00 UTC daily, so Task 09 should check the 2026-10-03 run
for recovery before considering reauthorization. The older business and
personal Executor connections remain in place for their existing consumers.

## 2026-10-02 Bank Data rename

The repository is now `christianalares/bank-data`, the local checkout is
`/Users/christian/dev/own/bank-data`, and the existing Railway project is named
`bank-data`. The deployed MCP service has a new active domain,
`bank-data-mcp.up.railway.app`; its old domain remains an alias. The code and
package names use Bank Data while compatibility identifiers, the business
workspace name, and historical notes retain their original values. The
production Railway IaC plan reports no changes. The existing Postgres service,
database, migrations, bank consents, and service IDs were not replaced.

Executor has a healthy `bank_data` integration and
`tools.bank_data.org.allBanks` connection using the saved all-bank credential.
Its three read-only tools returned selected Nordea, SEB, and Revolut accounts
and grouped booked totals. Older Executor connections remain available during
client migration.

In Enable Banking's existing production API application, the name is now
`Bank Data`, the description covers the owner's accounts, and
`https://bank-data-mcp.up.railway.app/banking/callback` is a fourth allowed
redirect URL. The three earlier callback URLs remain allowed. The MCP service's
`BANK_CONSENT_REDIRECT_ORIGIN` now points to the new domain; the resulting
Railway deployment succeeded. No new consent was started. The old callback and
domain remain available for in-flight authorizations and older clients.
