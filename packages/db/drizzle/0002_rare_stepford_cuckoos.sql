CREATE TYPE "public"."bank_transaction_status" AS ENUM('booked', 'pending');--> statement-breakpoint
CREATE TYPE "public"."banking_connection_provider" AS ENUM('csv', 'enable_banking');--> statement-breakpoint
CREATE TYPE "public"."banking_connection_status" AS ENUM('connected', 'error', 'pending', 'disconnected');--> statement-breakpoint
CREATE TABLE "bank_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider_account_id" text NOT NULL,
	"name" text NOT NULL,
	"iban" text,
	"currency" text DEFAULT 'SEK' NOT NULL,
	"account_type" text,
	"current_balance" numeric(14, 2),
	"available_balance" numeric(14, 2),
	"raw_metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" "banking_connection_provider" NOT NULL,
	"provider_connection_id" text NOT NULL,
	"name" text NOT NULL,
	"status" "banking_connection_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"raw_metadata" jsonb,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"provider" "banking_connection_provider" NOT NULL,
	"provider_transaction_id" text NOT NULL,
	"internal_id" text NOT NULL,
	"status" "bank_transaction_status" DEFAULT 'booked' NOT NULL,
	"booked_at" timestamp NOT NULL,
	"value_at" timestamp,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"description" text NOT NULL,
	"merchant_name" text,
	"counterparty_name" text,
	"balance_after_transaction" numeric(14, 2),
	"raw_metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_connection_id_bank_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connection" ADD CONSTRAINT "bank_connection_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_connection_id_bank_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_account_id_bank_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_account_provider_id_idx" ON "bank_account" USING btree ("connection_id","provider_account_id");--> statement-breakpoint
CREATE INDEX "bank_account_workspace_idx" ON "bank_account" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_connection_provider_id_idx" ON "bank_connection" USING btree ("workspace_id","provider","provider_connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_transaction_internal_id_idx" ON "bank_transaction" USING btree ("internal_id");--> statement-breakpoint
CREATE INDEX "bank_transaction_workspace_booked_idx" ON "bank_transaction" USING btree ("workspace_id","booked_at");--> statement-breakpoint
CREATE INDEX "bank_transaction_account_booked_idx" ON "bank_transaction" USING btree ("account_id","booked_at");