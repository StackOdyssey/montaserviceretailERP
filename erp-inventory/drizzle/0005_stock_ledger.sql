CREATE TABLE "stock_count_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_count_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"counted_qty" integer NOT NULL,
	"expected_qty" integer NOT NULL,
	"variance_qty" integer NOT NULL,
	"unit_cost_cents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_line_id" integer NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"counted_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "stock_counts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "stock_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"business_line_id" integer NOT NULL,
	"serial_no" text NOT NULL,
	"engine_no" text,
	"colour" text,
	"model_year" integer,
	"status" text DEFAULT 'IN_STOCK' NOT NULL,
	"unit_cost_cents" integer DEFAULT 0 NOT NULL,
	"receipt_line_id" integer,
	"sale_line_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "stock_units_serial_no_unique" UNIQUE("serial_no")
);
--> statement-breakpoint
ALTER TABLE "price_levels" DROP CONSTRAINT "price_levels_code_unique";--> statement-breakpoint
ALTER TABLE "price_levels" ADD COLUMN "business_line_id" integer;--> statement-breakpoint
UPDATE "price_levels" SET "business_line_id" = (SELECT "id" FROM "business_lines" WHERE "code" = 'PIECES') WHERE "business_line_id" IS NULL;--> statement-breakpoint
ALTER TABLE "price_levels" ALTER COLUMN "business_line_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "oem_code" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "last_purchase_price_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "cmup_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "products" SET "last_purchase_price_cents" = "cost_price_ht_cents", "cmup_cents" = "cost_price_ht_cents";--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."stock_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_units" ADD CONSTRAINT "stock_units_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_units" ADD CONSTRAINT "stock_units_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_levels" ADD CONSTRAINT "price_levels_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_levels" ADD CONSTRAINT "price_levels_line_code_unique" UNIQUE("business_line_id","code");
--> statement-breakpoint
INSERT INTO "price_levels" ("business_line_id","code","label","is_default") SELECT "id", 'LISTE', 'Prix catalogue', true FROM "business_lines" WHERE "code" = 'VEHICULES' ON CONFLICT ("business_line_id","code") DO NOTHING;