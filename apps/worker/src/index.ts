import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { HonoAdapter } from '@bull-board/hono'
import { getJobsDashboard, queues } from '@bank-data/jobs'
import { startWorkers } from '@bank-data/jobs/worker'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { basicAuth } from 'hono/basic-auth'
import { logger } from 'hono/logger'

const port = Number(process.env.PORT ?? 3001)
const bullBoardUsername = process.env.BULL_BOARD_USERNAME
const bullBoardPassword = process.env.BULL_BOARD_PASSWORD

if (process.env.NODE_ENV === 'production' && (!bullBoardUsername || !bullBoardPassword)) {
  throw new Error('BULL_BOARD_USERNAME and BULL_BOARD_PASSWORD are required in production')
}

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
    console.error('[worker] readiness check failed', error)

    return c.json({ status: 'not_ready' }, 503)
  }
})

const serverAdapter = new HonoAdapter(serveStatic)

createBullBoard({
  queues: Object.values(queues).map((queue) => new BullMQAdapter(queue)),
  serverAdapter,
})

serverAdapter.setBasePath('/')

const dashboard = new Hono()

if (bullBoardUsername && bullBoardPassword) {
  dashboard.use(
    '*',
    basicAuth({
      username: bullBoardUsername,
      password: bullBoardPassword,
    }),
  )
}

dashboard.route('/', serverAdapter.registerPlugin())
app.route('/', dashboard)

const shutdown = await startWorkers()
const server = serve(
  {
    fetch: app.fetch,
    hostname: '0.0.0.0',
    port,
  },
  (info) => {
    console.info(`[worker] HTTP server listening on http://0.0.0.0:${info.port}`)
    console.info('[worker] Bull Board available at /')
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
