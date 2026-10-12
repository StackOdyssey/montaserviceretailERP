ALTER TABLE "customers" ADD COLUMN "is_professional" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "default_price_level_id" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "credit_limit_cents" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "payment_terms" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "representative" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "is_active" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_default_price_level_id_price_levels_id_fk" FOREIGN KEY ("default_price_level_id") REFERENCES "public"."price_levels"("id") ON DELETE no action ON UPDATE no action;