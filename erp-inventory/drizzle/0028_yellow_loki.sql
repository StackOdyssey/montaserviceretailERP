ALTER TABLE "customers" ADD COLUMN "payment_term_days" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "risk_class" text DEFAULT 'NORMAL';--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "assigned_staff_id" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_assigned_staff_id_staff_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;