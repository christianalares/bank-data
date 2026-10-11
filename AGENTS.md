# Agent Instructions

## Information layer boundary

Christian confirmed on 2026-10-11 that Railway/Bank Data is an information
store and MCP interface. Keep all AI, OCR, document interpretation,
classification, matching heuristics, and payment-status inference outside this
service. Codex performs that reasoning through chat and supplies explicit
records, evidence, and status changes through MCP.

Use the existing Drizzle schema and migrations for any future invoice/payment
register. Keep payment state separate from transaction matching. Deterministic
validation, authorization, referential integrity, idempotency, and audit history
belong in this service; existing bank import and sync may continue. Never mark a
payment or match confirmed merely because a name or amount resembles a record.

A transaction UI is deferred. Chat and MCP are the first interface. This
architecture decision alone does not authorize production migrations or payment
initiation. Bookkeeper OS's local registers remain authoritative until an
explicit, verified cutover; do not treat legacy attachment links as current
matching evidence without reconciliation.

## Non-Interactive Shell Commands

Always use non-interactive flags with file operations to avoid confirmation prompts.

```bash
cp -f source dest
mv -f source dest
rm -f file
rm -rf directory
cp -rf source dest
```

Use `scp -o BatchMode=yes` and `ssh -o BatchMode=yes`. Use `apt-get -y` and
`HOMEBREW_NO_AUTO_UPDATE=1` for Homebrew commands.

## Migration Work

Track migration status and acceptance evidence in `Docs/PLAN.md` and
`Docs/NOTES.md`. Preserve the production database and follow the cutover gates
in the plan.

## Session Completion

If files changed, run the relevant quality gates, commit the changes, pull with
rebase, and push the branch. Verify that `git status` shows the branch is up to
date with its remote, then hand off any remaining work.
