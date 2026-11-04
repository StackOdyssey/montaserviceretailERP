CREATE TABLE "brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "brands_name_unique" UNIQUE("name")
);
--> statement-breakpoint
-- G14 : alimenter la liste des marques gérées depuis les marques saisies en libre sur les produits.
INSERT INTO "brands" ("name","sort_order")
SELECT DISTINCT "brand", 0 FROM "products" WHERE "brand" IS NOT NULL AND "brand" <> ''
ON CONFLICT ("name") DO NOTHING;
