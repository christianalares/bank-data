CREATE TYPE "public"."bank_transfer_state" AS ENUM('ordinary', 'suggested', 'confirmed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."personal_search_index_status" AS ENUM('pending', 'indexed', 'error');--> statement-breakpoint
CREATE TYPE "public"."workspace_kind" AS ENUM('business', 'personal');--> statement-breakpoint
CREATE TABLE "personal_mcp_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"filter_summary" jsonb,
	"result_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_mcp_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "personal_mcp_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "personal_transaction_search_token" (
	"workspace_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	CONSTRAINT "personal_transaction_search_token_pk" PRIMARY KEY("transaction_id","token_hash")
);
--> statement-breakpoint
ALTER TABLE "bank_account" ADD COLUMN "encrypted_personal_payload" text;--> statement-breakpoint
ALTER TABLE "bank_account" ADD COLUMN "included" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_connection" ADD COLUMN "consent_valid_until" timestamp;--> statement-breakpoint
ALTER TABLE "bank_connection" ADD COLUMN "disconnected_at" timestamp;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "encrypted_personal_payload" text;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "transfer_state" "bank_transfer_state" DEFAULT 'ordinary' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "transfer_pair_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "transfer_confidence" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "personal_search_status" "personal_search_index_status";--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "personal_search_indexed_at" timestamp;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD COLUMN "personal_search_error" text;--> statement-breakpoint
ALTER TABLE "gmail_connection" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "kind" "workspace_kind" DEFAULT 'business' NOT NULL;--> statement-breakpoint
ALTER TABLE "personal_mcp_audit" ADD CONSTRAINT "personal_mcp_audit_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_mcp_audit" ADD CONSTRAINT "personal_mcp_audit_token_id_personal_mcp_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."personal_mcp_token"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_mcp_token" ADD CONSTRAINT "personal_mcp_token_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_transaction_search_token" ADD CONSTRAINT "personal_transaction_search_token_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_transaction_search_token" ADD CONSTRAINT "personal_transaction_search_token_transaction_id_bank_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."bank_transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_mcp_audit_workspace_created_idx" ON "personal_mcp_audit" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "personal_mcp_token_workspace_idx" ON "personal_mcp_token" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "personal_transaction_search_token_lookup_idx" ON "personal_transaction_search_token" USING btree ("workspace_id","token_hash");--> statement-breakpoint
ALTER TABLE "gmail_connection" ADD CONSTRAINT "gmail_connection_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_transaction_transfer_pair_idx" ON "bank_transaction" USING btree ("workspace_id","transfer_pair_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_owner_kind_idx" ON "workspace" USING btree ("owner_id","kind");