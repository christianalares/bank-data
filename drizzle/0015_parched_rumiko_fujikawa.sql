ALTER TABLE "bank_account" DROP CONSTRAINT "bank_account_connection_id_bank_connection_id_fk";
--> statement-breakpoint
ALTER TABLE "bank_transaction" DROP CONSTRAINT "bank_transaction_connection_id_bank_connection_id_fk";
--> statement-breakpoint
ALTER TABLE "bank_account" ALTER COLUMN "connection_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_transaction" ALTER COLUMN "connection_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_connection_id_bank_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_connection_id_bank_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connection"("id") ON DELETE set null ON UPDATE no action;