CREATE TABLE "sales_tenders" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"method" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"cash_received_cents" integer,
	"reference_number" text,
	"bank_name" text,
	"payee_name" text,
	"issue_date" timestamp,
	"due_date" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "sales_lines" ADD COLUMN "unit_price_ttc_cents" integer;--> statement-breakpoint
ALTER TABLE "sales_lines" ADD COLUMN "custom_label" text;--> statement-breakpoint
ALTER TABLE "sales_lines" ADD COLUMN "is_free" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_lines" ADD COLUMN "price_forced" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_tenders" ADD CONSTRAINT "sales_tenders_document_id_sales_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."sales_documents"("id") ON DELETE cascade ON UPDATE no action;