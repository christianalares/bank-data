import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  server: {
    host: true, // Allow external connections (needed for LocalCan)
    port: 3000,
    allowedHosts: ['localhost3000-37.localcan.dev'],
  },
  ssr: {
    // These packages use tslib in a way that triggers a broken CJS→ESM
    // interop in Nitro's SSR bundler: __toESM(require_tslib()).default is
    // always undefined because tslib sets __esModule:true without a .default
    // export. Marking them external lets Node load them natively at runtime
    // via CJS, bypassing the interop entirely.
    external: ['bullmq', 'ioredis', '@ioredis/commands', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
  },
  plugins: [
    devtools(),
    nitro({
      rollupConfig: {
        external: [/^@sentry\//],
      },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
