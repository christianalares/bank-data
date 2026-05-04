import type { ConnectionOptions } from 'bullmq'

export function getRedisConnection(redisUrl = process.env.REDIS_URL): ConnectionOptions {
  if (!redisUrl) {
    throw new Error('REDIS_URL is required')
  }

  const url = new URL(redisUrl)

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  }
}
