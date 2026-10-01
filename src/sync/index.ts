import { closeDb } from '#db'
import { runBankSync } from '../jobs/tasks/sync-banking'

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: pnpm start:sync\nRun one bank sync using the existing Trigger task logic.')
    return
  }

  if (process.argv.length > 2) {
    throw new Error('Unknown sync arguments. Use --help for usage.')
  }

  try {
    const result = await runBankSync({ overlapDays: 14 })
    console.log(JSON.stringify(result))
  } finally {
    await closeDb()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
