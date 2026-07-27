# Hidden Village

Private business operations app for time tracking, transaction review, inbox matching, and
accountant exports without SaaS surface area.

## Stack

- TanStack Start web app in `apps/web`
- BullMQ jobs service in `apps/jobs`
- Postgres with Drizzle in `packages/db`
- Better Auth in `packages/auth`
- S3-compatible storage adapter in `packages/storage`
- shadcn/ui components in the web app
- pnpm, Turbo, and Biome

## Local Development

Copy the example environment file, prepare the database, and start the app:

```bash
cp .env.example .env
pnpm install
pnpm dev:infra
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev` also runs `pnpm dev:infra` before starting the web and jobs apps, so
you only need `pnpm dev:infra` separately when preparing the database before the
first migration or seed.

The seed script creates or repairs the first admin login from `INITIAL_ADMIN_EMAIL`,
`INITIAL_ADMIN_PASSWORD`, and `INITIAL_ADMIN_NAME` in your ignored `.env` file.

Local Postgres is published on port `5433` to avoid colliding with a machine-level Postgres
on the default `5432` port.

The Railway deployment will use the same environment contract as local development.

## Personal semantic search

The isolated Workers AI + Vectorize gateway lives in `infra/personal-search-worker`. Deploy it
without adding Wrangler to the application workspace:

```bash
pnpm dlx wrangler@4 deploy --config infra/personal-search-worker/wrangler.jsonc
```

Its `PERSONAL_SEARCH_API_TOKEN` secret must match the web, MCP, and Trigger.dev production
environments.
