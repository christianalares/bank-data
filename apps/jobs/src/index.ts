import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getJobsDashboard, queues } from '@bank-data/jobs'
import { WorkbenchCore } from '@bank-data/jobs/monitor'
import { startWorkers } from '@bank-data/jobs/worker'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { basicAuth } from 'hono/basic-auth'
import { logger } from 'hono/logger'
import { createApiRoutes } from './monitor-router'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORKBENCH_UI_PATH = join(__dirname, '..', 'workbench-ui', 'ui')

const port = Number(process.env.PORT ?? 3001)
const dashboardUsername = process.env.JOBS_DASHBOARD_USERNAME
const dashboardPassword = process.env.JOBS_DASHBOARD_PASSWORD

if (process.env.NODE_ENV === 'production' && (!dashboardUsername || !dashboardPassword)) {
  throw new Error('JOBS_DASHBOARD_USERNAME and JOBS_DASHBOARD_PASSWORD are required in production')
}

const monitorCore = new WorkbenchCore({
  queues: Object.values(queues),
  title: 'Bank Data Jobs',
  readonly: false,
  ...(dashboardUsername && dashboardPassword
    ? { auth: { username: dashboardUsername, password: dashboardPassword } }
    : {}),
})

const app = new Hono()

app.use(logger())

app.get('/healthz', (c) => {
  return c.json({ status: 'ok' })
})

app.get('/readyz', async (c) => {
  try {
    const dashboard = await getJobsDashboard()

    return c.json({
      status: 'ready',
      queues: dashboard.queues.map((queue) => queue.queueName),
    })
  } catch (error) {
    console.error('[jobs] readiness check failed', error)

    return c.json({ status: 'not_ready' }, 503)
  }
})

if (dashboardUsername && dashboardPassword) {
  app.use(
    '*',
    basicAuth({
      username: dashboardUsername,
      password: dashboardPassword,
    }),
  )
}

// Config endpoint consumed by the SPA
app.get('/config', (c) => c.json(monitorCore.getConfig()))

// API routes
app.route('/api', createApiRoutes(monitorCore))

// Static assets from the pre-built SPA
app.get('/assets/:file', (c) => {
  const filePath = join(WORKBENCH_UI_PATH, 'assets', c.req.param('file'))
  if (!existsSync(filePath)) {
    return c.text('Not found', 404)
  }
  const content = readFileSync(filePath)
  const fileName = c.req.param('file')
  const contentType = fileName.endsWith('.js')
    ? 'application/javascript'
    : fileName.endsWith('.css')
      ? 'text/css'
      : 'application/octet-stream'
  return c.body(content, 200, { 'Content-Type': contentType })
})

// SPA fallback — all other routes serve index.html
app.get('*', (c) => {
  const indexPath = join(WORKBENCH_UI_PATH, 'index.html')
  if (!existsSync(indexPath)) {
    return c.text('Workbench UI not built. Run the build step first.', 404)
  }
  const url = new URL(c.req.url)
  let basePath = url.pathname
  // Strip known client-side routes to determine the mount point
  for (const route of [
    /\/queues\/[^/]+\/jobs\/[^/]+\/?$/,
    /\/queues\/[^/]+\/?$/,
    /\/flows\/[^/]+\/[^/]+\/?$/,
    /\/schedulers\/?$/,
    /\/flows\/?$/,
    /\/metrics\/?$/,
    /\/test\/?$/,
  ]) {
    basePath = basePath.replace(route, '')
  }
  if (!basePath.endsWith('/')) {
    basePath = `${basePath}/`
  }
  let html = readFileSync(indexPath, 'utf-8')
  html = html.replace('<head>', `<head>\n    <base href="${basePath}">`)
  return c.html(html)
})

const shutdown = await startWorkers()
const server = serve(
  {
    fetch: app.fetch,
    hostname: '0.0.0.0',
    port,
  },
  (info) => {
    console.info(`[jobs] HTTP server listening on port ${info.port}`)
    console.info(`[jobs] Workbench: http://localhost:${info.port}/`)
  },
)

async function stop() {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
  await shutdown()
  process.exit(0)
}

process.on('SIGINT', () => {
  void stop()
})

process.on('SIGTERM', () => {
  void stop()
})
