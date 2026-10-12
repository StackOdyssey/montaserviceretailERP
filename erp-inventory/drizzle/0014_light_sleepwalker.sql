CREATE TABLE "archive_manifests" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_label" text NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"doc_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "dgi_validation_id" text;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "dgi_status" text;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "dgi_signature" text;