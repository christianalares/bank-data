CREATE TABLE "gmail_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "reference_id" text;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_reference_id_unique" UNIQUE("reference_id");