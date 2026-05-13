CREATE TYPE "public"."attachment_source" AS ENUM('manual', 'email');--> statement-breakpoint
CREATE TYPE "public"."attachment_status" AS ENUM('unmatched', 'matched', 'ignored');--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "status" "attachment_status" DEFAULT 'unmatched' NOT NULL;--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "source" "attachment_source" DEFAULT 'manual' NOT NULL;