# Bank Data

Private bank data service for personal, shared, and Hidden Village business accounts.
It syncs booked transactions and exposes read-only MCP tools.

## Stack

- One pnpm application package at the repository root
- MCP in `src/mcp`, bank provider in `src/banking`, and Postgres access in `src/db`
- Separate MCP and bank sync entry points in `src/mcp/index.ts` and `src/sync/index.ts`
- Drizzle migrations in `drizzle`, with the original SQL and journal preserved
- Biome for formatting and linting

## Naming transition

`Bank Data` names the project, MCP server, and Enable Banking application.
`Hidden Village` still names the business workspace. The stored personal token
prefix, local Postgres credentials, and some public Railway domains retain their
current identifiers while their consumers are migrated or retired. The MCP endpoint
is `https://bank-data-mcp.up.railway.app/mcp`. Its old domain remains reachable
while older clients migrate. New bank consents use the Bank Data callback.

## Local Development

Copy the example environment file, prepare the local database, and start the MCP server:

```bash
cp .env.example .env
pnpm install
pnpm dev:infra
pnpm db:migrate
pnpm dev
```

`pnpm dev` starts local Postgres and the MCP server. `pnpm build` builds the
MCP and sync artifacts. `pnpm test`, `pnpm typecheck`, `pnpm check`, and
`pnpm db:check` run local quality gates.

`pnpm db:migrate` targets the `DATABASE_URL` in the local `.env` file.
`pnpm db:migrate:prod` uses the process environment and must only be run after
verifying the target and the backup and restore gate in `Docs/PLAN.md`.

Local Postgres is published on port `5433` to avoid colliding with a machine-level Postgres
on the default `5432` port.

The Railway configuration retains the protected Postgres service and volume,
MCP service, and bank-sync cron. Review the production plan
before any infrastructure change. Follow the backup and restore gate in
`Docs/PLAN.md` before any database change.
