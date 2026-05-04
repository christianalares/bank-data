import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { createDb } from '@bank-data/db'
import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

export const auth = betterAuth({
  basePath: '/api/auth',
  database: drizzleAdapter(createDb(), {
    provider: 'pg',
  }),
  emailAndPassword: {
    enabled: true,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  plugins: [admin(), tanstackStartCookies()],
})

export type Auth = typeof auth
