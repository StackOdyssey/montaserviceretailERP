ALTER TABLE "sales_documents" ADD COLUMN "customer_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "customer_phone" text;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "customer_email" text;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "customer_city" text;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "customer_ice" text;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "payment_method" text;