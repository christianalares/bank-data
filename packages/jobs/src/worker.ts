import { type Job, Worker } from 'bullmq'

import { getRedisConnection } from './connection'
import { type QueueName, queueNames } from './queues'

async function placeholderProcessor(job: Job) {
  console.info(`[jobs] ${job.queueName}:${job.name} placeholder processed`, {
    id: job.id,
  })
}

function createWorker(name: QueueName) {
  return new Worker(name, placeholderProcessor, {
    connection: getRedisConnection(),
    concurrency: 5,
  })
}

export async function startWorkers() {
  const workers = [
    createWorker(queueNames.banking),
    createWorker(queueNames.inbox),
    createWorker(queueNames.matching),
    createWorker(queueNames.exports),
  ]

  console.info('[jobs] workers started')

  return async () => {
    await Promise.all(workers.map((worker) => worker.close()))
    console.info('[jobs] workers stopped')
  }
}
