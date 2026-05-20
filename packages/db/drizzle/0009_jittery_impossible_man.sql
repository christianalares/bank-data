CREATE TABLE "gmail_imported_ref" (
	"reference_id" text PRIMARY KEY NOT NULL,
	"imported_at" timestamp DEFAULT now() NOT NULL
);
