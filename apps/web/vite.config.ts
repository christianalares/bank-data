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
    // Force the workspace storage package and its AWS SDK deps to be
    // bundled into the SSR output rather than treated as Node externals.
    // Without this, Nitro/Rollup can't resolve the CJS→ESM interop for
    // tslib helpers that the AWS SDK v3 relies on at runtime.
    noExternal: ['@bank-data/storage', /^@aws-sdk\//],
  },
  plugins: [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
