import { startWorkers } from '@bank-data/jobs/worker'

const shutdown = await startWorkers()

async function stop() {
  await shutdown()
  process.exit(0)
}

process.on('SIGINT', () => {
  void stop()
})

process.on('SIGTERM', () => {
  void stop()
})
