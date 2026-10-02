# Agent Instructions

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
