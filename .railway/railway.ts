import { defineRailway, github, postgres, preserve, project, service, volume } from 'railway/iac'

export default defineRailway((context) => {
  if (context.projectId !== 'c6c36c86-d6c0-4c07-b181-d903db2e3b7b') {
    throw new Error('This configuration targets the existing bank-data project only.')
  }
  if (context.environmentId !== 'b9e7fc05-5205-4f40-be2d-f6e160aa2d18') {
    throw new Error('This configuration targets the existing production environment only.')
  }

  const migrationBranch = github('christianalares/bank-data', {
    branch: 'codex/bank-mcp-migration',
    checkSuites: false,
  })

  // Existing service 404f6fb9-da37-403f-b1f3-e8d6e2c54d60. Railway binds
  // this resource by database.Postgres; preserve that address and its volume.
  const Postgres = postgres('Postgres', { region: 'europe-west4-drams3a' })
  Postgres.networking = { privateNetworkEndpoint: 'postgres', tcpProxies: { '5432': {} } }
  // Existing volume ecb799b2-792d-491d-bef4-796be65bd259. Its production
  // instance 9810bac8-ee35-418a-9330-da0c2487e659 is mounted on Postgres
  // at /var/lib/postgresql/data. A no-change plan verifies this import.
  const postgresVolumeR7JC = volume('postgres-volume-r7JC', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'europe-west4-drams3a',
    sizeMB: 5000,
  })
  // Existing service ac79bd9a-021b-4bdb-95a8-40bdaca72393.
  const mcp = service('mcp', {
    source: migrationBranch,
    build: 'pnpm build:server',
    start: 'pnpm start:mcp',
    replicas: { 'europe-west4-drams3a': 1 },
    env: {
      BANK_CONSENT_BUSINESS_WORKSPACE_ID: preserve(),
      BANK_CONSENT_COOKIE_SECRET: preserve(),
      BANK_CONSENT_MCP_TOKEN: preserve(),
      BANK_CONSENT_PERSONAL_WORKSPACE_ID: preserve(),
      BANK_CONSENT_REDIRECT_ORIGIN: preserve(),
      DATABASE_STATEMENT_TIMEOUT_MS: preserve(),
      DATABASE_URL: preserve(),
      ENABLE_BANKING_APPLICATION_ID: preserve(),
      ENABLE_BANKING_PRIVATE_KEY_BASE64: preserve(),
      MCP_ALLOWED_HOSTS: preserve(),
      MCP_ALL_BANKS_TOKEN: preserve(),
      MCP_API_TOKEN: preserve(),
      MCP_TRANSPORT: preserve(),
      PERSONAL_DATA_ENCRYPTION_KEY: preserve(),
    },
  })
  const bankSync = service('bank-sync', {
    source: migrationBranch,
    build: 'pnpm build:server',
    start: 'pnpm start:sync',
    deploy: {
      cronSchedule: '0 2 * * *',
      restartPolicyType: 'NEVER',
    },
    replicas: { 'europe-west4-drams3a': 1 },
    env: {
      DATABASE_URL: Postgres.env.DATABASE_URL,
      ENABLE_BANKING_APPLICATION_ID: mcp.env.ENABLE_BANKING_APPLICATION_ID,
      ENABLE_BANKING_PRIVATE_KEY_BASE64: mcp.env.ENABLE_BANKING_PRIVATE_KEY_BASE64,
      PERSONAL_DATA_ENCRYPTION_KEY: mcp.env.PERSONAL_DATA_ENCRYPTION_KEY,
    },
  })
  return project('bank-data', {
    resources: [Postgres, mcp, bankSync, postgresVolumeR7JC],
  })
})
