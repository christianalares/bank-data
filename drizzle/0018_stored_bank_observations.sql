CREATE TABLE "bank_fetch_state" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_finished_at" timestamp with time zone,
	"next_allowed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"failure" jsonb
);
--> statement-breakpoint
CREATE TABLE "bank_upcoming_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider_account_id" text NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"retrieved_at" timestamp with time zone,
	"stored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"complete" boolean NOT NULL,
	"pages_retrieved" integer NOT NULL,
	"incomplete_reason" text,
	"failure" jsonb,
	"entries" jsonb NOT NULL,
	"excluded_status_counts" jsonb NOT NULL,
	"excluded_by_value_date_count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_fetch_state" ADD CONSTRAINT "bank_fetch_state_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_upcoming_snapshot" ADD CONSTRAINT "bank_upcoming_snapshot_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_upcoming_snapshot" ADD CONSTRAINT "bank_upcoming_snapshot_account_id_bank_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_upcoming_snapshot" ADD CONSTRAINT "bank_upcoming_snapshot_connection_id_bank_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_upcoming_snapshot_source_idx" ON "bank_upcoming_snapshot" USING btree ("workspace_id","account_id","connection_id","stored_at");