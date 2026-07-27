UPDATE "gmail_connection"
SET "workspace_id" = (
	SELECT "id"
	FROM "workspace"
	WHERE "kind" = 'business'
	ORDER BY "created_at" ASC
	LIMIT 1
)
WHERE "workspace_id" IS NULL;--> statement-breakpoint
ALTER TABLE "gmail_connection" ALTER COLUMN "workspace_id" SET NOT NULL;
