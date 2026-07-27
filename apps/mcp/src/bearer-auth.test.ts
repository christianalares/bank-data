import { afterEach, describe, expect, it } from 'vitest'

import {
  getBearerToken,
  getRequiredApiToken,
  hashPersonalMcpToken,
  hasValidBearerToken,
} from './bearer-auth'

const VALID_TOKEN = '0123456789abcdef0123456789abcdef'
const originalToken = process.env.MCP_API_TOKEN

afterEach(() => {
  if (originalToken === undefined) {
    delete process.env.MCP_API_TOKEN
    return
  }

  process.env.MCP_API_TOKEN = originalToken
})

describe('bearer authentication', () => {
  it('accepts an exact bearer token', () => {
    expect(hasValidBearerToken(`Bearer ${VALID_TOKEN}`, VALID_TOKEN)).toBe(true)
  })

  it('rejects missing, malformed, and incorrect tokens', () => {
    expect(hasValidBearerToken(undefined, VALID_TOKEN)).toBe(false)
    expect(hasValidBearerToken(`Basic ${VALID_TOKEN}`, VALID_TOKEN)).toBe(false)
    expect(hasValidBearerToken('Bearer wrong-token', VALID_TOKEN)).toBe(false)
  })

  it('requires a high-entropy-length configured token', () => {
    process.env.MCP_API_TOKEN = 'too-short'

    expect(() => getRequiredApiToken()).toThrow('at least 32 characters')
  })

  it('extracts and hashes personal bearer tokens without retaining plaintext', () => {
    const token = 'hv_personal_0123456789abcdef0123456789abcdef'

    expect(getBearerToken(`Bearer ${token}`)).toBe(token)
    expect(hashPersonalMcpToken(token)).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(hashPersonalMcpToken(token)).not.toContain(token)
  })
})
