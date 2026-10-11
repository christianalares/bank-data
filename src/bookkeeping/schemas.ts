import { z } from 'zod'

const reference = z.string().trim().min(1).max(4000)
const key = z.string().trim().min(1).max(500)
const money = z.string().regex(/^-?\d{1,12}\.\d{2}$/)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const hashes = z
  .array(hash)
  .max(100)
  .refine((v) => new Set(v).size === v.length)
const keys = z
  .array(key)
  .max(100)
  .refine((v) => new Set(v).size === v.length)
export const matchingState = z.enum(['unreviewed', 'review', 'confirmed', 'missing', 'accountant'])
export const paymentState = z.enum([
  'unknown',
  'unpaid',
  'scheduled',
  'paid',
  'partially_paid',
  'cancelled',
  'refunded',
])
export const evidence = z
  .object({
    sourceType: z.enum([
      'user_confirmation',
      'bank',
      'receipt',
      'document_review',
      'historical_register',
    ]),
    reference,
    explanation: reference,
  })
  .strict()
const write = {
  requestId: key,
  actor: z.enum(['Christian', 'Codex', 'verified_backfill']),
  expectedRevision: z.number().int().min(0),
}
export const documentInput = z
  .object({
    ...write,
    sha256: hash,
    localPath: reference,
    originalFilename: reference,
    sourceReference: reference,
    sentStatus: z.enum(['skickat', 'ej-skickat', 'ej-avsett']),
    metadata: z.record(z.string(), z.string()).default({}),
  })
  .strict()
export const transactionInput = z
  .object({
    ...write,
    providerTransactionId: key,
    bankTransactionId: z.string().uuid().nullable(),
    bankAliasIds: z.array(z.string().uuid()).max(100).default([]),
    bankDate: z.string().date(),
    amount: money,
    currency: z.string().regex(/^[A-Z]{3}$/),
    description: reference,
    matchingState,
    documentHashes: hashes,
    followupClosed: z.boolean().default(false),
    evidence,
    metadata: z.record(z.string(), z.string()).default({}),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.matchingState === 'confirmed' && v.documentHashes.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'A confirmed match requires document hashes' })
    }
    if (!v.bankTransactionId && !v.providerTransactionId.startsWith('historisk-blip-export:')) {
      ctx.addIssue({
        code: 'custom',
        message: 'An exact bank row is required except for a preserved historical export',
      })
    }
  })
export const invoiceInput = z
  .object({
    ...write,
    externalKey: key,
    vendor: reference,
    invoiceNumber: key.nullable(),
    ocr: key.nullable(),
    bankgiro: key.nullable(),
    amount: money.refine((v) => Number(v) > 0, 'Invoice amount must be positive'),
    currency: z.string().regex(/^[A-Z]{3}$/),
    dueDate: z.string().date().nullable(),
    paymentState,
    paymentDate: z.string().date().nullable(),
    paymentEvidence: evidence.nullable(),
    documentHashes: hashes.min(1),
    transactionKeys: keys,
    gmailReferences: z
      .array(z.object({ account: z.string().email(), messageId: key }).strict())
      .max(100),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!['unknown', 'unpaid'].includes(v.paymentState) && !v.paymentEvidence) {
      ctx.addIssue({ code: 'custom', message: 'Payment-state changes require explicit evidence' })
    }
    if (
      ['scheduled', 'paid', 'partially_paid', 'refunded'].includes(v.paymentState) &&
      !v.paymentDate
    ) {
      ctx.addIssue({ code: 'custom', message: 'A payment date is required' })
    }
    if (v.paymentState === 'scheduled' && v.transactionKeys.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Scheduled payments cannot claim a completed bank transaction',
      })
    }
  })
const pagination = {
  key: key.optional(),
  limit: z.number().int().min(1).max(200).default(50),
  cursor: key.optional(),
}
export const documentListInput = z.object(pagination).strict()
export const historyListInput = documentListInput
export const invoiceListInput = z
  .object({ ...pagination, paymentState: paymentState.optional() })
  .strict()
export const transactionListInput = z
  .object({
    ...pagination,
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    matchingState: matchingState.optional(),
    includeClosed: z.boolean().default(true),
  })
  .strict()
  .refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, 'Invalid date range')
