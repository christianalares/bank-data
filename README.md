# Hidden Village

Hidden Village bank data service and legacy web routes during the migration.

## Stack

- One pnpm application package at the repository root
- MCP in `src/mcp`, bank provider in `src/banking`, and Postgres access in `src/db`
- Separate MCP and bank sync entry points in `src/mcp/index.ts` and `src/sync/index.ts`
- Drizzle migrations in `drizzle`, with the original SQL and journal preserved
- Legacy TanStack Start routes in `apps/web/src` and Trigger tasks in `src/jobs`
- Biome for formatting and linting

## Local Development

Copy the example environment file, prepare the local database, and start the web app:

```bash
cp .env.example .env
pnpm install
pnpm dev:infra
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev` starts local Postgres and the legacy web app. Run `pnpm dev:jobs`
separately when testing the existing Trigger tasks. `pnpm dev:mcp` starts the MCP
entry point. `pnpm build` builds the MCP, sync, and web artifacts. `pnpm test`,
`pnpm typecheck`, `pnpm check`, and `pnpm db:check` run local quality gates.

`pnpm db:migrate` targets the `DATABASE_URL` in the local `.env` file.
`pnpm db:migrate:prod` uses the process environment and must only be run after
verifying the target and the backup and restore gate in `Docs/PLAN.md`.

The seed script creates or repairs the first admin login from `INITIAL_ADMIN_EMAIL`,
`INITIAL_ADMIN_PASSWORD`, and `INITIAL_ADMIN_NAME` in your ignored `.env` file.

Local Postgres is published on port `5433` to avoid colliding with a machine-level Postgres
on the default `5432` port.

The existing Railway configuration remains a snapshot of live services. It still
contains the old workspace commands and must be reviewed before any deployment.
Do not apply it or run a production migration while the backup and restore gate
in `Docs/PLAN.md` remains open.

## Personal semantic search

The isolated Workers AI + Vectorize gateway lives in `infra/personal-search-worker`. Deploy it
without adding Wrangler to the application package:

```bash
pnpm dlx wrangler@4 deploy --config infra/personal-search-worker/wrangler.jsonc
```

Its `PERSONAL_SEARCH_API_TOKEN` secret must match the web, MCP, and Trigger.dev production
environments.
