CREATE TABLE "business_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"logo_url" text,
	"footer_text" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "business_lines_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "business_line_document_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_line_id" integer NOT NULL,
	"doc_type" text NOT NULL,
	"show_vat" boolean DEFAULT true NOT NULL,
	"price_basis" text DEFAULT 'TTC' NOT NULL,
	"show_discount" boolean DEFAULT true NOT NULL,
	"template_code" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "business_line_document_settings_unique" UNIQUE("business_line_id","doc_type"),
	CONSTRAINT "business_line_document_settings_fac_av_show_vat" CHECK ("business_line_document_settings"."doc_type" NOT IN ('FAC','AV') OR "business_line_document_settings"."show_vat")
);
--> statement-breakpoint
INSERT INTO "business_lines" ("code","display_name","sort_order","is_active") VALUES ('PIECES','Pièces moto',1,true),('VEHICULES','Quads & Buggy',2,true) ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "business_line_document_settings" ("business_line_id","doc_type","show_vat","price_basis","show_discount")
SELECT bl."id", v."doc_type", v."show_vat", 'TTC', true
FROM "business_lines" bl
CROSS JOIN (VALUES ('DEVIS',false),('BC',false),('BL',false),('FAC',true),('AV',true)) AS v("doc_type","show_vat")
WHERE bl."code" = 'PIECES'
ON CONFLICT ("business_line_id","doc_type") DO NOTHING;
--> statement-breakpoint
INSERT INTO "business_line_document_settings" ("business_line_id","doc_type","show_vat","price_basis","show_discount")
SELECT bl."id", v."doc_type", true, 'TTC', true
FROM "business_lines" bl
CROSS JOIN (VALUES ('DEVIS'),('BC'),('BL'),('FAC'),('AV')) AS v("doc_type")
WHERE bl."code" = 'VEHICULES'
ON CONFLICT ("business_line_id","doc_type") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "business_line_id" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_serialized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "business_line_id" integer;--> statement-breakpoint
UPDATE "products" SET "business_line_id" = (SELECT "id" FROM "business_lines" WHERE "code" = 'PIECES') WHERE "business_line_id" IS NULL;--> statement-breakpoint
UPDATE "stock_movements" sm SET "business_line_id" = p."business_line_id" FROM "products" p WHERE p."id" = sm."product_id" AND sm."business_line_id" IS NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "business_line_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "business_line_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "business_line_document_settings" ADD CONSTRAINT "business_line_document_settings_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;
