CREATE TABLE "expense_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"vat_deductible_default" boolean DEFAULT true NOT NULL,
	"receipt_required" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "numbering_sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_type" text NOT NULL,
	"year" integer NOT NULL,
	"scope_business_line_id" integer,
	"prefix" text NOT NULL,
	"width" integer DEFAULT 5 NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "numbering_sequences_scope_unique" UNIQUE NULLS NOT DISTINCT("doc_type","year","scope_business_line_id")
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "payment_methods_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "settings_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" integer,
	"field_name" text NOT NULL,
	"before_value" text,
	"after_value" text,
	"changed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
INSERT INTO "expense_categories" ("name","vat_deductible_default","receipt_required","sort_order") VALUES
 ('Loyer', true, true, 1),
 ('Salaires et CNSS', false, false, 2),
 ('Eau, électricité, télécom', true, true, 3),
 ('Transport et carburant', true, true, 4),
 ('Maintenance et réparations', true, true, 5),
 ('Fournitures', true, true, 6),
 ('Assurances', true, true, 7),
 ('Frais bancaires', true, true, 8),
 ('Impôts et taxes (TP, vignette)', false, false, 9),
 ('Honoraires', true, true, 10),
 ('Publicité et marketing', true, true, 11),
 ('Autres', false, false, 12);
--> statement-breakpoint
INSERT INTO "payment_methods" ("code","label","sort_order") VALUES
 ('ESPECES','Espèces',1),('CHEQUE','Chèque',2),('EFFET_LCN','Effet / LCN',3),('VIREMENT','Virement',4)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "numbering_sequences" ("doc_type","year","scope_business_line_id","prefix","width","next_number") VALUES
 ('DEVIS',2027,NULL,'DV-',5,1),('BC',2027,NULL,'BC-',5,1),('BL',2027,NULL,'BL-',5,1),
 ('FAC',2027,NULL,'FAC-',5,1),('AV',2027,NULL,'AV-',5,1),('BR',2027,NULL,'BR-',5,1)
ON CONFLICT ("doc_type","year","scope_business_line_id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "city" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "raison_sociale" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "trade_name" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "legal_form" text DEFAULT 'SARL' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "rc_tribunal" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "capital_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "cnss" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "website" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "footer_text" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "default_vat_rate_id" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "vat_regime" text DEFAULT 'ENCAISSEMENTS' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "locale_default" text DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "locale_secondary" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "timezone" text DEFAULT 'Africa/Casablanca' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "negative_stock_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "cash_daily_threshold_cents" integer DEFAULT 500000 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "cash_monthly_threshold_cents" integer DEFAULT 5000000 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "year_start_month" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "number_width" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "devis_prefix" text DEFAULT 'DV-' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "bc_prefix" text DEFAULT 'BC-' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "fac_prefix" text DEFAULT 'FAC-' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "av_prefix" text DEFAULT 'AV-' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "br_prefix" text DEFAULT 'BR-' NOT NULL;--> statement-breakpoint
ALTER TABLE "numbering_sequences" ADD CONSTRAINT "numbering_sequences_scope_business_line_id_business_lines_id_fk" FOREIGN KEY ("scope_business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_default_vat_rate_id_vat_rates_id_fk" FOREIGN KEY ("default_vat_rate_id") REFERENCES "public"."vat_rates"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "settings" DEFAULT VALUES;