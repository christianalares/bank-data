import { z } from 'zod'

const dateSchema = z.string().date()

export const bankReadInputSchema = z
  .object({
    accountId: z.string().uuid().optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
  })
  .refine(({ dateFrom, dateTo }) => !dateFrom || !dateTo || dateFrom <= dateTo, {
    message: 'dateFrom must be on or before dateTo',
  })

export const listBankTransactionsInputSchema = bankReadInputSchema.safeExtend({
  cursor: z.string().min(1).max(1000).optional(),
  limit: z.number().int().min(1).max(200).default(50),
})

const bankAccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  currency: z.string(),
  currentBalance: z.string().nullable(),
  availableBalance: z.string().nullable(),
  updatedAt: z.string().datetime(),
  lastSyncedAt: z.string().datetime().nullable(),
  connectionStatus: z.enum(['connected', 'error', 'pending', 'disconnected']),
})

export const bankAccountsSchema = z.object({
  accounts: z.array(bankAccountSchema),
  asOf: z.string().datetime(),
})

export const bankTransactionPageSchema = z.object({
  transactions: z.array(
    z.object({
      id: z.string().uuid(),
      accountId: z.string().uuid(),
      accountName: z.string(),
      bookedAt: z.string().datetime(),
      amount: z.string(),
      currency: z.string(),
      description: z.string(),
      merchantName: z.string().nullable(),
      counterpartyName: z.string().nullable(),
      status: z.literal('booked'),
    }),
  ),
  nextCursor: z.string().nullable(),
  incompletePage: z.boolean(),
  asOf: z.string().datetime(),
  accountFreshness: z.array(
    bankAccountSchema.pick({ id: true, lastSyncedAt: true, connectionStatus: true }),
  ),
})

export const bankTotalsSchema = z.object({
  totals: z.array(
    z.object({
      currency: z.string(),
      transactionCount: z.number().int().nonnegative(),
      credits: z.string(),
      debits: z.string(),
      net: z.string(),
    }),
  ),
  asOf: z.string().datetime(),
  accountFreshness: bankTransactionPageSchema.shape.accountFreshness,
})

const categorizedBankAccountSchema = bankAccountSchema.extend({
  bankName: z.string(),
  workspaceKind: z.enum(['personal', 'business']),
})

export const allBankAccountsSchema = z.object({
  accounts: z.array(categorizedBankAccountSchema),
  asOf: z.string().datetime(),
})

export const allBankReadInputSchema = bankReadInputSchema.safeExtend({
  bankName: z.string().min(1).max(200).optional(),
})

export const listAllBankTransactionsInputSchema = listBankTransactionsInputSchema.safeExtend({
  bankName: allBankReadInputSchema.shape.bankName,
})

export const allBankTransactionPageSchema = bankTransactionPageSchema.extend({
  transactions: z.array(
    bankTransactionPageSchema.shape.transactions.element.extend({
      bankName: z.string(),
      workspaceKind: z.enum(['personal', 'business']),
    }),
  ),
  accountFreshness: z.array(
    categorizedBankAccountSchema.pick({
      id: true,
      bankName: true,
      workspaceKind: true,
      lastSyncedAt: true,
      connectionStatus: true,
    }),
  ),
})

export const allBankTotalsSchema = z.object({
  totals: z.array(
    bankTotalsSchema.shape.totals.element.extend({
      bankName: z.string(),
      workspaceKind: z.enum(['personal', 'business']),
    }),
  ),
  asOf: z.string().datetime(),
  accountFreshness: allBankTransactionPageSchema.shape.accountFreshness,
})

export type BankReadInput = z.input<typeof bankReadInputSchema>
export type ListBankTransactionsInput = z.input<typeof listBankTransactionsInputSchema>
export type ListAllBankTransactionsInput = z.input<typeof listAllBankTransactionsInputSchema>
export type AllBankReadInput = z.input<typeof allBankReadInputSchema>
