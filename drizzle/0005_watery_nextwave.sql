DO $$ BEGIN
  CREATE TYPE "public"."attachment_source" AS ENUM('manual', 'email');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."attachment_status" AS ENUM('unmatched', 'matched', 'ignored');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN IF NOT EXISTS "status" "attachment_status" DEFAULT 'unmatched' NOT NULL;
--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN IF NOT EXISTS "source" "attachment_source" DEFAULT 'manual' NOT NULL;
