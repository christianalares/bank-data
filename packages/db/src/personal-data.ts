import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const ENVELOPE_VERSION = 'v1'

export type PersonalTransactionPayload = {
  description: string
  merchantName: string | null
  counterpartyName: string | null
  note: string | null
  rawMetadata: unknown
  merchantOverride?: string | null
  noteOverride?: string | null
}

export type PersonalAccountPayload = {
  name: string
  iban: string | null
  accountType: string | null
  rawMetadata: unknown
}

export function encryptPersonalTransactionPayload(payload: PersonalTransactionPayload) {
  return encryptPersonalPayload(payload)
}

export function encryptPersonalAccountPayload(payload: PersonalAccountPayload) {
  return encryptPersonalPayload(payload)
}

export function encryptPersonalProviderPayload(payload: unknown) {
  return encryptPersonalPayload(payload)
}

export function decryptPersonalProviderPayload(ciphertext: string) {
  return decryptPersonalPayload(ciphertext)
}

function encryptPersonalPayload(payload: unknown) {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, getPersonalDataKey(), iv)
  const plaintext = JSON.stringify(payload)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    ENVELOPE_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

export function decryptPersonalTransactionPayload(ciphertext: string): PersonalTransactionPayload {
  return decryptPersonalPayload(ciphertext) as PersonalTransactionPayload
}

export function decryptPersonalAccountPayload(ciphertext: string): PersonalAccountPayload {
  return decryptPersonalPayload(ciphertext) as PersonalAccountPayload
}

function decryptPersonalPayload(ciphertext: string) {
  const [version, ivValue, tagValue, encryptedValue] = ciphertext.split('.')

  if (version !== ENVELOPE_VERSION || !ivValue || !tagValue || !encryptedValue) {
    throw new Error('Unsupported personal transaction payload')
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getPersonalDataKey(),
    Buffer.from(ivValue, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8')

  return JSON.parse(plaintext) as unknown
}

export function createPersonalSearchToken(value: string) {
  return createHmac('sha256', getPersonalDataKey())
    .update(value.normalize('NFKC').trim().toLocaleLowerCase('sv-SE'))
    .digest('base64url')
}

export function tokenizePersonalSearchText(value: string) {
  return [
    ...new Set(
      value
        .normalize('NFKC')
        .toLocaleLowerCase('sv-SE')
        .split(/[^\p{L}\p{N}]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  ]
}

function getPersonalDataKey() {
  const configured = process.env.PERSONAL_DATA_ENCRYPTION_KEY?.trim()

  if (!configured) {
    throw new Error('PERSONAL_DATA_ENCRYPTION_KEY is required')
  }

  if (!/^[a-fA-F0-9]{64}$/.test(configured)) {
    throw new Error('PERSONAL_DATA_ENCRYPTION_KEY must be a 64-character hex value')
  }

  return Buffer.from(configured, 'hex')
}
