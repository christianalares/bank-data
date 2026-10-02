import { closeDb } from '#db'
import { runBankSync } from './bank-sync'

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: pnpm start:sync [--account-id UUID]\nRun one Railway bank sync and exit.')
    return
  }

  const args = process.argv.slice(2)
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--account-id')) {
    throw new Error('Unknown sync arguments. Use --help for usage.')
  }
  const accountId = args[1]
  if (
    accountId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)
  ) {
    throw new Error('Account ID must be a UUID')
  }

  try {
    const result = await runBankSync({ overlapDays: 14, accountId })
    console.log(JSON.stringify(result))
  } finally {
    await closeDb()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
