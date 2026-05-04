import { Queue } from 'bullmq'

import { getRedisConnection } from './connection'

export const queueNames = {
  banking: 'banking',
  inbox: 'inbox',
  matching: 'matching',
  exports: 'exports',
} as const

export type QueueName = (typeof queueNames)[keyof typeof queueNames]

export function createQueue(name: QueueName) {
  return new Queue(name, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  })
}

export const queues = {
  banking: createQueue(queueNames.banking),
  inbox: createQueue(queueNames.inbox),
  matching: createQueue(queueNames.matching),
  exports: createQueue(queueNames.exports),
}
