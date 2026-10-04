import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    mcp: 'src/mcp/index.ts',
    sync: 'src/sync/index.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
})
