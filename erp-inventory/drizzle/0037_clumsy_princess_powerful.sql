CREATE TABLE "customer_product_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"price_ht_cents" integer,
	"custom_designation" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "customer_product_prices_customer_product_unique" UNIQUE("customer_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "customer_product_prices" ADD CONSTRAINT "customer_product_prices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_product_prices" ADD CONSTRAINT "customer_product_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;