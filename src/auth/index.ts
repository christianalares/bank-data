import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { createDb } from '#db'

const allowedHosts = Array.from(
  new Set(
    ['localhost:*', 'localhost3000-37.localcan.dev', process.env.RAILWAY_PUBLIC_DOMAIN].filter(
      (host): host is string => Boolean(host),
    ),
  ),
)

export const auth = betterAuth({
  basePath: '/api/auth',
  database: drizzleAdapter(createDb(), {
    provider: 'pg',
  }),
  emailAndPassword: {
    enabled: true,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: {
    allowedHosts,
    protocol: 'auto',
    fallback:
      process.env.NODE_ENV === 'production'
        ? process.env.RAILWAY_PUBLIC_DOMAIN
        : 'http://localhost:3000',
  },
  plugins: [admin(), tanstackStartCookies()],
})

export type Auth = typeof auth
