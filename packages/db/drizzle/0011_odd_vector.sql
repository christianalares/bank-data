CREATE TABLE "attachment_suggestion_dismissal" (
	"workspace_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_suggestion_dismissal_pk" PRIMARY KEY("attachment_id","transaction_id")
);
--> statement-breakpoint
ALTER TABLE "attachment_suggestion_dismissal" ADD CONSTRAINT "attachment_suggestion_dismissal_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_suggestion_dismissal" ADD CONSTRAINT "attachment_suggestion_dismissal_attachment_id_attachment_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_suggestion_dismissal" ADD CONSTRAINT "attachment_suggestion_dismissal_transaction_id_bank_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."bank_transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_suggestion_dismissal_workspace_idx" ON "attachment_suggestion_dismissal" USING btree ("workspace_id");