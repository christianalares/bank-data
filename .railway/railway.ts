import {
  bucket,
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  service,
  volume,
} from 'railway/iac'

export default defineRailway((context) => {
  if (context.projectId !== requiredSetting('RAILWAY_EXPECTED_PROJECT_ID')) {
    throw new Error('This configuration targets the existing bank-data project only.')
  }
  if (context.environmentId !== requiredSetting('RAILWAY_EXPECTED_ENVIRONMENT_ID')) {
    throw new Error('This configuration targets the existing production environment only.')
  }

  const bankData = github('christianalares/bank-data', { checkSuites: false })
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
  // Existing bucket [private resource identifier].
  const bucketResource = bucket('bucket', { region: 'ams' })
  // Existing service [private resource identifier].
  const mcp = service('mcp', {
    source: migrationBranch,
    build: 'pnpm build:server',
    start: 'pnpm start:mcp',
    replicas: { 'europe-west4-drams3a': 1 },
    env: {
      AWS_ACCESS_KEY_ID: preserve(),
      AWS_DEFAULT_REGION: preserve(),
      AWS_ENDPOINT_URL: preserve(),
      AWS_S3_BUCKET_NAME: preserve(),
      AWS_SECRET_ACCESS_KEY: preserve(),
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
      MCP_API_TOKEN: preserve(),
      MCP_TRANSPORT: preserve(),
      PERSONAL_DATA_ENCRYPTION_KEY: preserve(),
      PERSONAL_SEARCH_API_TOKEN: preserve(),
      PERSONAL_SEARCH_SERVICE_URL: preserve(),
    },
  })
  // Existing service [private resource identifier].
  const web = service('web', {
    source: bankData,
    build: 'pnpm --filter @bank-data/web build',
    start: 'pnpm --filter @bank-data/web start',
    preDeploy: 'pnpm db:migrate:prod',
    replicas: { 'europe-west4-drams3a': 1 },
    networking: { privateNetworkEndpoint: 'bank-data' },
    env: {
      AWS_ACCESS_KEY_ID: preserve(),
      AWS_DEFAULT_REGION: preserve(),
      AWS_ENDPOINT_URL: preserve(),
      AWS_S3_BUCKET_NAME: preserve(),
      AWS_SECRET_ACCESS_KEY: preserve(),
      BETTER_AUTH_SECRET: preserve(),
      BETTER_AUTH_URL: preserve(),
      DATABASE_URL: preserve(),
      ENABLE_BANKING_APPLICATION_ID: preserve(),
      ENABLE_BANKING_PRIVATE_KEY_BASE64: preserve(),
      ENABLE_BANKING_REDIRECT_ORIGIN: preserve(),
      GMAIL_ENCRYPTION_KEY: preserve(),
      GOOGLE_CLIENT_ID: preserve(),
      GOOGLE_CLIENT_SECRET: preserve(),
      GOOGLE_REDIRECT_URI: preserve(),
      MCP_PUBLIC_URL: preserve(),
      PERSONAL_DATA_ENCRYPTION_KEY: preserve(),
      PERSONAL_SEARCH_API_TOKEN: preserve(),
      PERSONAL_SEARCH_SERVICE_URL: preserve(),
      REDIS_URL: preserve(),
      TRIGGER_SECRET_KEY: preserve(),
    },
  })

  return project('bank-data', {
    resources: [Postgres, mcp, web, postgresVolume, bucketResource],
  })
})

function requiredSetting(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Set ${name} privately before reviewing this infrastructure plan.`)
  return value
}
