CREATE TABLE "cashier_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_line_id" integer NOT NULL,
	"status" text DEFAULT 'OUVERTE' NOT NULL,
	"opened_by" text,
	"opened_at" timestamp DEFAULT now(),
	"closed_by" text,
	"closed_at" timestamp,
	"float_cents" integer DEFAULT 0 NOT NULL,
	"float_denominations" jsonb,
	"declared_tenders" jsonb,
	"theoretical_tenders" jsonb,
	"observation" text
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "journee_id" integer;--> statement-breakpoint
ALTER TABLE "cashier_days" ADD CONSTRAINT "cashier_days_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_journee_id_cashier_days_id_fk" FOREIGN KEY ("journee_id") REFERENCES "public"."cashier_days"("id") ON DELETE no action ON UPDATE no action;