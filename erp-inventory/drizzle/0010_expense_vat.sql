ALTER TABLE "expenses" ADD COLUMN "category_id" integer;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "amount_ht_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "tva_rate" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "tva_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;