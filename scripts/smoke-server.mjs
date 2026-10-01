import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const port = await reservePort()
const server = spawn(process.execPath, ['dist/mcp.js'], {
  env: {
    ...process.env,
    DATABASE_URL: '',
    MCP_API_TOKEN: '0123456789abcdef0123456789abcdef',
    MCP_TRANSPORT: 'http',
    PORT: String(port),
  },
  stdio: ['ignore', 'ignore', 'pipe'],
})
let serverError = ''
server.stderr.setEncoding('utf8')
server.stderr.on('data', (chunk) => {
  serverError += chunk
})

try {
  await waitForServer(port, server)
  const health = await fetch(`http://127.0.0.1:${port}/health`)
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: 'ok' })

  const unauthorized = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    body: '{}',
  })
  assert.equal(unauthorized.status, 401)
  assert.equal(
    unauthorized.headers.get('www-authenticate'),
    'Bearer realm="hidden-village-finance"',
  )

  const syncHelp = await runSyncHelp()
  assert.match(syncHelp, /Usage: pnpm start:sync/)
  console.log('MCP health, bearer guard, and sync entry point smoke checks passed')
} finally {
  server.kill('SIGTERM')
}

async function reservePort() {
  const listener = createServer()
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve))
  const address = listener.address()
  assert.ok(address && typeof address !== 'string')
  await new Promise((resolve) => listener.close(resolve))
  return address.port
}

async function waitForServer(port, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`MCP process exited early: ${serverError}`)
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      if (response.ok) {
        return
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  throw new Error(`MCP process did not start: ${serverError}`)
}

async function runSyncHelp() {
  const child = spawn(process.execPath, ['dist/sync.js', '--help'], {
    env: { ...process.env, DATABASE_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  let error = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    output += chunk
  })
  child.stderr.on('data', (chunk) => {
    error += chunk
  })
  const code = await new Promise((resolve) => child.once('close', resolve))
  assert.equal(code, 0, error)
  return output
}
