import { closeDb } from '#db'
import { runBankSync } from './bank-sync'

async function main() {
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: pnpm start:sync [--account-id UUID | --workspace-id UUID]\nRun one coordinated bank sync and exit. Shared cooldowns apply to explicit requests too.',
    )
    return
  }

  const args = process.argv.slice(2)
  if (
    args.length !== 0 &&
    (args.length !== 2 || !['--account-id', '--workspace-id'].includes(args[0]))
  ) {
    throw new Error('Unknown sync arguments. Use --help for usage.')
  }
  const targetId = args[1]
  if (
    targetId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)
  ) {
    throw new Error('Target ID must be a UUID')
  }

  try {
    const result = await runBankSync({
      overlapDays: 14,
      ...(args[0] === '--workspace-id' ? { workspaceId: targetId } : { accountId: targetId }),
    })
    console.log(JSON.stringify(result))
  } finally {
    await closeDb()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
