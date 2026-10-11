import { defineRailway, github, postgres, preserve, project, service, volume } from 'railway/iac'

export default defineRailway((context) => {
  if (context.projectId !== requiredSetting('RAILWAY_EXPECTED_PROJECT_ID')) {
    throw new Error('This configuration targets the existing bank-data project only.')
  }
  if (context.environmentId !== requiredSetting('RAILWAY_EXPECTED_ENVIRONMENT_ID')) {
    throw new Error('This configuration targets the existing production environment only.')
  }

  const migrationBranch = github('christianalares/bank-data', {
    branch: 'codex/bank-mcp-migration',
    checkSuites: false,
  })

  // Existing service [private resource identifier]. Railway binds
  // this resource by database.Postgres; preserve that address and its volume.
  const Postgres = postgres('Postgres', { region: 'europe-west4-drams3a' })
  Postgres.networking = { privateNetworkEndpoint: 'postgres', tcpProxies: { '5432': {} } }
  // Existing volume [private resource identifier]. Its production
  // instance [private resource identifier] is mounted on Postgres
  // at /var/lib/postgresql/data. A no-change plan verifies this import.
  const postgresVolume = volume(requiredSetting('RAILWAY_POSTGRES_VOLUME_NAME'), {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'europe-west4-drams3a',
    sizeMB: 5000,
  })
  // Existing service [private resource identifier].
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
      MCP_BOOKKEEPING_TOKEN: preserve(),
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
    resources: [Postgres, mcp, bankSync, postgresVolume],
  })
})

function requiredSetting(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Set ${name} privately before reviewing this infrastructure plan.`)
  return value
}
