ALTER TABLE "settings" ADD COLUMN "mobile_whatsapp" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "bank_name" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "bank_agency" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "bank_rib" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "bank2_name" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "bank2_agency" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "bank2_rib" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "default_payment_due_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "display_discount_under_brut" boolean DEFAULT true NOT NULL;