CREATE TABLE "staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'COMMERCIAL' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "commercial_id" integer;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "commercial_name" text;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "livreur_id" integer;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD COLUMN "livreur_name" text;