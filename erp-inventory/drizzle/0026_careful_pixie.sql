ALTER TABLE "sales_documents" ADD COLUMN "prep_status" text;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "prepared_at" timestamp;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "delivered_at" timestamp;