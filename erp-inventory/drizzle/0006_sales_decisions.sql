CREATE TABLE "document_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_document_id" integer NOT NULL,
	"target_document_id" integer NOT NULL,
	"link_type" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "sales_documents" ALTER COLUMN "tva_rate" SET DEFAULT 20;--> statement-breakpoint
ALTER TABLE "sales_lines" ALTER COLUMN "tva_rate" SET DEFAULT 20;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "business_line_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "doc_year" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "sequence_no" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "validated_at" timestamp;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "sales_lines" ADD COLUMN "discount_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_lines" ADD COLUMN "discount_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_lines" ADD COLUMN "unit_cost_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_lines" ADD COLUMN "total_ttc_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_source_document_id_sales_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."sales_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_target_document_id_sales_documents_id_fk" FOREIGN KEY ("target_document_id") REFERENCES "public"."sales_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;