import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  noExternal: ['@bank-data/finance', '@bank-data/db', '@bank-data/storage'],
})
