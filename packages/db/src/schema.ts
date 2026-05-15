import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Invoice parsing schema (shared between DB column typing and the jobs package)
// ─────────────────────────────────────────────────────────────────────────────

export const parsedInvoiceSchema = z.object({
  vendorName: z.string().nullable().describe('Name of the vendor or supplier issuing the invoice'),
  amount: z.string().nullable().describe('Total amount due as a decimal string, e.g. "1250.00"'),
  currency: z.string().nullable().describe('ISO 4217 currency code, e.g. "SEK", "EUR", "USD"'),
  invoiceDate: z
    .string()
    .nullable()
    .describe('Invoice issue date in ISO 8601 format, e.g. "2024-03-15"'),
  dueDate: z
    .string()
    .nullable()
    .describe('Payment due date in ISO 8601 format, null if not present'),
  invoiceNumber: z.string().nullable().describe('Invoice or receipt number/reference'),
  lineItems: z
    .array(
      z.object({
        description: z.string(),
        amount: z.string().describe('Line item total as a decimal string'),
      }),
    )
    .optional()
    .describe('Individual line items if present on the invoice'),
})

export type ParsedInvoice = z.infer<typeof parsedInvoiceSchema>

export const timeEntrySource = pgEnum('time_entry_source', ['manual', 'timer'])
export const attachmentStatus = pgEnum('attachment_status', [
  'unmatched',
  'suggested',
  'matched',
  'ignored',
])
export const attachmentSource = pgEnum('attachment_source', ['manual', 'email'])
export const bankingConnectionProvider = pgEnum('banking_connection_provider', [
  'csv',
  'enable_banking',
])
export const bankingConnectionStatus = pgEnum('banking_connection_status', [
  'connected',
  'error',
  'pending',
  'disconnected',
])
export const bankTransactionStatus = pgEnum('bank_transaction_status', ['booked', 'pending'])

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('user'),
  banned: boolean('banned').notNull().default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  impersonatedBy: text('impersonated_by'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const workspace = pgTable('workspace', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  baseCurrency: text('base_currency').notNull().default('SEK'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const trackerProject = pgTable('tracker_project', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  hourlyRate: numeric('hourly_rate', { precision: 10, scale: 2 }),
  currency: text('currency').notNull().default('SEK'),
  billable: boolean('billable').notNull().default(true),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const timeEntry = pgTable(
  'time_entry',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => trackerProject.id, {
      onDelete: 'set null',
    }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    source: timeEntrySource('source').notNull().default('manual'),
    description: text('description'),
    startedAt: timestamp('started_at').notNull(),
    stoppedAt: timestamp('stopped_at'),
    durationSeconds: integer('duration_seconds').notNull(),
    billable: boolean('billable').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('time_entry_active_timer_user_idx')
      .on(table.workspaceId, table.userId)
      .where(sql`${table.stoppedAt} is null`),
  ],
)

export const bankConnection = pgTable(
  'bank_connection',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    provider: bankingConnectionProvider('provider').notNull(),
    providerConnectionId: text('provider_connection_id').notNull(),
    name: text('name').notNull(),
    status: bankingConnectionStatus('status').notNull().default('pending'),
    errorMessage: text('error_message'),
    rawMetadata: jsonb('raw_metadata'),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('bank_connection_provider_id_idx').on(
      table.workspaceId,
      table.provider,
      table.providerConnectionId,
    ),
  ],
)

export const bankAccount = pgTable(
  'bank_account',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => bankConnection.id, { onDelete: 'cascade' }),
    providerAccountId: text('provider_account_id').notNull(),
    name: text('name').notNull(),
    iban: text('iban'),
    currency: text('currency').notNull().default('SEK'),
    accountType: text('account_type'),
    currentBalance: numeric('current_balance', { precision: 14, scale: 2 }),
    availableBalance: numeric('available_balance', { precision: 14, scale: 2 }),
    rawMetadata: jsonb('raw_metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('bank_account_provider_id_idx').on(table.connectionId, table.providerAccountId),
    index('bank_account_workspace_idx').on(table.workspaceId),
  ],
)

export const bankTransaction = pgTable(
  'bank_transaction',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => bankConnection.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => bankAccount.id, { onDelete: 'cascade' }),
    provider: bankingConnectionProvider('provider').notNull(),
    providerTransactionId: text('provider_transaction_id').notNull(),
    internalId: text('internal_id').notNull(),
    status: bankTransactionStatus('status').notNull().default('booked'),
    bookedAt: timestamp('booked_at').notNull(),
    valueAt: timestamp('value_at'),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    description: text('description').notNull(),
    merchantName: text('merchant_name'),
    counterpartyName: text('counterparty_name'),
    balanceAfterTransaction: numeric('balance_after_transaction', { precision: 14, scale: 2 }),
    note: text('note'),
    rawMetadata: jsonb('raw_metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('bank_transaction_internal_id_idx').on(table.internalId),
    index('bank_transaction_workspace_booked_idx').on(table.workspaceId, table.bookedAt),
    index('bank_transaction_account_booked_idx').on(table.accountId, table.bookedAt),
  ],
)

export const attachment = pgTable(
  'attachment',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id').references(() => bankTransaction.id, {
      onDelete: 'set null',
    }),
    status: attachmentStatus('status').notNull().default('unmatched'),
    source: attachmentSource('source').notNull().default('manual'),
    s3Key: text('s3_key').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    parsedInvoice: jsonb('parsed_invoice').$type<ParsedInvoice>(),
    suggestedTransactionId: uuid('suggested_transaction_id').references(() => bankTransaction.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('attachment_workspace_idx').on(table.workspaceId),
    index('attachment_transaction_idx').on(table.transactionId),
  ],
)

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas — runtime validation + source of truth for all row types
// ─────────────────────────────────────────────────────────────────────────────

export const attachmentSelectSchema = createSelectSchema(attachment, {
  // jsonb column: drizzle-zod cannot infer .$type<>(), so we provide it explicitly
  parsedInvoice: parsedInvoiceSchema.nullable(),
})

export const attachmentInsertSchema = createInsertSchema(attachment, {
  parsedInvoice: parsedInvoiceSchema.nullable(),
})

export const bankTransactionSelectSchema = createSelectSchema(bankTransaction)
export const bankTransactionInsertSchema = createInsertSchema(bankTransaction)

export const bankAccountSelectSchema = createSelectSchema(bankAccount)
export const bankConnectionSelectSchema = createSelectSchema(bankConnection)
export const workspaceSelectSchema = createSelectSchema(workspace)
export const trackerProjectSelectSchema = createSelectSchema(trackerProject)
export const timeEntrySelectSchema = createSelectSchema(timeEntry)

// ─────────────────────────────────────────────────────────────────────────────
// Row types — derived from the Zod schemas above, not hand-rolled
// Indexed as DatabaseTable.Attachment, DatabaseTable.BankTransaction, etc.
// ─────────────────────────────────────────────────────────────────────────────

export namespace DatabaseTable {
  export type Attachment = z.infer<typeof attachmentSelectSchema>
  export type AttachmentInsert = z.infer<typeof attachmentInsertSchema>
  export type BankTransaction = z.infer<typeof bankTransactionSelectSchema>
  export type BankTransactionInsert = z.infer<typeof bankTransactionInsertSchema>
  export type BankAccount = z.infer<typeof bankAccountSelectSchema>
  export type BankConnection = z.infer<typeof bankConnectionSelectSchema>
  export type Workspace = z.infer<typeof workspaceSelectSchema>
  export type TrackerProject = z.infer<typeof trackerProjectSelectSchema>
  export type TimeEntry = z.infer<typeof timeEntrySelectSchema>
}
