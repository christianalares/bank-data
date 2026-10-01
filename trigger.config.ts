import { defineConfig } from '@trigger.dev/sdk/v3'

export default defineConfig({
  // Find your project ref at https://cloud.trigger.dev → your project → Settings
  project: 'proj_pvcrmruqtbrscrqfkyup',
  runtime: 'node',
  logLevel: 'log',
  maxDuration: 300,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ['./src/jobs/tasks'],
})
