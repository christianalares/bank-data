CREATE TYPE "public"."bookkeeping_matching_state" AS ENUM('unreviewed', 'review', 'confirmed', 'missing', 'accountant');--> statement-breakpoint
CREATE TYPE "public"."bookkeeping_payment_state" AS ENUM('unpaid', 'scheduled', 'paid', 'partially_paid', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TABLE "bookkeeping_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"entity" text NOT NULL,
	"entity_key" text NOT NULL,
	"actor" text NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookkeeping_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"local_path" text NOT NULL,
	"original_filename" text NOT NULL,
	"source_reference" text NOT NULL,
	"sent_status" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookkeeping_invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"external_key" text NOT NULL,
	"vendor" text NOT NULL,
	"invoice_number" text,
	"ocr" text,
	"bankgiro" text,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"due_date" date,
	"payment_state" "bookkeeping_payment_state" NOT NULL,
	"payment_date" date,
	"payment_evidence" jsonb,
	"document_hashes" jsonb NOT NULL,
	"transaction_keys" jsonb NOT NULL,
	"gmail_references" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookkeeping_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider_transaction_id" text NOT NULL,
	"bank_transaction_id" uuid,
	"bank_alias_ids" jsonb NOT NULL,
	"bank_date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"description" text NOT NULL,
	"matching_state" "bookkeeping_matching_state" NOT NULL,
	"document_hashes" jsonb NOT NULL,
	"followup_closed" boolean DEFAULT false NOT NULL,
	"evidence" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookkeeping_audit" ADD CONSTRAINT "bookkeeping_audit_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookkeeping_document" ADD CONSTRAINT "bookkeeping_document_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookkeeping_invoice" ADD CONSTRAINT "bookkeeping_invoice_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookkeeping_transaction" ADD CONSTRAINT "bookkeeping_transaction_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookkeeping_transaction" ADD CONSTRAINT "bookkeeping_transaction_bank_transaction_id_bank_transaction_id_fk" FOREIGN KEY ("bank_transaction_id") REFERENCES "public"."bank_transaction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookkeeping_audit_scope_request_idx" ON "bookkeeping_audit" USING btree ("workspace_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookkeeping_document_scope_hash_idx" ON "bookkeeping_document" USING btree ("workspace_id","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "bookkeeping_invoice_scope_key_idx" ON "bookkeeping_invoice" USING btree ("workspace_id","external_key");--> statement-breakpoint
CREATE UNIQUE INDEX "bookkeeping_transaction_scope_provider_idx" ON "bookkeeping_transaction" USING btree ("workspace_id","provider_transaction_id");--> statement-breakpoint
CREATE INDEX "bookkeeping_transaction_bank_idx" ON "bookkeeping_transaction" USING btree ("workspace_id","bank_transaction_id");