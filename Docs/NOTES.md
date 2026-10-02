# Migration notes and handoff

Updated: 2026-10-02 05:32 UTC. Branch: `codex/bank-mcp-migration`.

## Task 09: bounded bank comparison and unattended gates

The checkout began clean at `bcefc73` and matched the freshly fetched remote
branch. `bd`, `br`, and `bv` are unavailable on this host, so the plan ledger
records Task 09 as in progress. Fresh Railway status still lists the existing
Postgres service `404f6fb9-da37-403f-b1f3-e8d6e2c54d60`, MCP, web, and
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
`origin/codex/bank-mcp-migration`. `bd`, `br`, and `bv` are unavailable on this
host, so the plan ledger records status. No application source, bank row,
Railway resource, database setting, or existing bearer value was changed.

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

The checkout began clean at `f52c38f`, matching the remote branch. `bd`,
`br`, and `bv` remain unavailable on this host; the plan ledger carries the
task status. No database schema, migration, provider request, account row,
Railway resource, or consent setting was changed for this task.

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
without approval prompts. `bd`, `br`, and `bv` are unavailable on this host,
so this ledger carries Task 06 status. Fresh Railway status still showed the
protected Postgres service `404f6fb9-da37-403f-b1f3-e8d6e2c54d60` and the
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
