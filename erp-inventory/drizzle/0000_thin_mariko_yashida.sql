CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer,
	"details" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"document_id" integer,
	"amount_cents" integer NOT NULL,
	"payment_method" text DEFAULT 'ESPECES' NOT NULL,
	"payment_date" timestamp DEFAULT now(),
	"reference_number" text,
	"cheque_due_date" timestamp,
	"bank_name" text,
	"status" text DEFAULT 'ENCAISSE' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"city" text DEFAULT 'Casablanca',
	"address" text,
	"ice" text,
	"is_wholesale" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'AUTRE' NOT NULL,
	"amount_cents" integer NOT NULL,
	"expense_date" timestamp DEFAULT now(),
	"receipt_photo_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "price_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "price_levels_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "product_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"price_level_id" integer NOT NULL,
	"price_ht_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "product_prices_product_level_unique" UNIQUE("product_id","price_level_id")
);
--> statement-breakpoint
CREATE TABLE "product_references" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"reference_code" text NOT NULL,
	"reference_type" text DEFAULT 'OEM'
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"barcode" text,
	"name" text NOT NULL,
	"brand" text,
	"nature" text,
	"category_id" integer,
	"supplier_id" integer,
	"warehouse_id" integer,
	"vat_rate_id" integer,
	"tva_rate" integer DEFAULT 20 NOT NULL,
	"cost_price_ht_cents" integer DEFAULT 0 NOT NULL,
	"sale_price_ht_cents" integer DEFAULT 0 NOT NULL,
	"margin_percent" numeric(8, 2),
	"stock_value_purchase_cents" integer DEFAULT 0 NOT NULL,
	"min_stock_alert" integer DEFAULT 5 NOT NULL,
	"current_stock" integer DEFAULT 0 NOT NULL,
	"shelf_location" text,
	"photo_url" text,
	"unit" text DEFAULT 'PIECE',
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "sales_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_type" text DEFAULT 'BL' NOT NULL,
	"doc_number" text NOT NULL,
	"customer_id" integer,
	"doc_date" timestamp DEFAULT now(),
	"status" text DEFAULT 'BROUILLON' NOT NULL,
	"total_brut_ht_cents" integer DEFAULT 0 NOT NULL,
	"discount_percent" integer DEFAULT 0 NOT NULL,
	"discount_amount_cents" integer DEFAULT 0 NOT NULL,
	"total_net_ht_cents" integer DEFAULT 0 NOT NULL,
	"tva_rate" integer DEFAULT 10 NOT NULL,
	"tva_amount_cents" integer DEFAULT 0 NOT NULL,
	"total_ttc_cents" integer DEFAULT 0 NOT NULL,
	"paid_amount_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"source_bl_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "sales_documents_doc_number_unique" UNIQUE("doc_number")
);
--> statement-breakpoint
CREATE TABLE "sales_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"product_id" integer,
	"product_name_snapshot" text NOT NULL,
	"sku_snapshot" text NOT NULL,
	"oem_code_snapshot" text,
	"unit_price_ht_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"total_ht_cents" integer NOT NULL,
	"tva_rate" integer DEFAULT 10 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_name" text DEFAULT 'SARL BM Motors' NOT NULL,
	"ice" text DEFAULT '' NOT NULL,
	"identifiant_fiscal" text DEFAULT '',
	"registre_commerce" text DEFAULT '',
	"taxe_professionnelle" text DEFAULT '',
	"address" text DEFAULT '',
	"city" text DEFAULT 'Casablanca',
	"phone" text DEFAULT '',
	"email" text DEFAULT '',
	"default_tva_rate" integer DEFAULT 10 NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"bl_prefix" text DEFAULT 'BL-' NOT NULL,
	"facture_prefix" text DEFAULT 'FAC-' NOT NULL,
	"avoir_prefix" text DEFAULT 'AV-' NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"movement_type" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost_cents" integer,
	"source_document_id" integer,
	"source_document_type" text,
	"reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "supplier_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer,
	"direction" text DEFAULT 'SORTANT' NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"body_text" text,
	"body_html" text,
	"status" text DEFAULT 'ENVOYE' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"has_attachments" boolean DEFAULT false NOT NULL,
	"attachments_json" text DEFAULT '[]',
	"message_id" text,
	"thread_id" text,
	"sent_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"receipt_id" integer,
	"amount_cents" integer NOT NULL,
	"payment_method" text DEFAULT 'CHEQUE' NOT NULL,
	"payment_date" timestamp DEFAULT now(),
	"reference_number" text,
	"due_date" timestamp,
	"bank_name" text,
	"status" text DEFAULT 'EN_ATTENTE' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "supplier_receipt_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_id" integer NOT NULL,
	"product_id" integer,
	"product_name" text NOT NULL,
	"sku" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost_cents" integer NOT NULL,
	"total_cost_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"receipt_number" text NOT NULL,
	"supplier_invoice_number" text,
	"receipt_date" timestamp DEFAULT now(),
	"status" text DEFAULT 'RECU' NOT NULL,
	"total_ht_cents" integer DEFAULT 0 NOT NULL,
	"tva_rate" integer DEFAULT 10 NOT NULL,
	"tva_amount_cents" integer DEFAULT 0 NOT NULL,
	"total_ttc_cents" integer DEFAULT 0 NOT NULL,
	"paid_amount_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "supplier_receipts_receipt_number_unique" UNIQUE("receipt_number")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"city" text,
	"ice" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vat_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"rate_percent" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "warehouses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_document_id_sales_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."sales_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_price_level_id_price_levels_id_fk" FOREIGN KEY ("price_level_id") REFERENCES "public"."price_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_references" ADD CONSTRAINT "product_references_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_vat_rate_id_vat_rates_id_fk" FOREIGN KEY ("vat_rate_id") REFERENCES "public"."vat_rates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_lines" ADD CONSTRAINT "sales_lines_document_id_sales_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."sales_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_lines" ADD CONSTRAINT "sales_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_emails" ADD CONSTRAINT "supplier_emails_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_receipt_id_supplier_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."supplier_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_receipt_lines" ADD CONSTRAINT "supplier_receipt_lines_receipt_id_supplier_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."supplier_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_receipt_lines" ADD CONSTRAINT "supplier_receipt_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_receipts" ADD CONSTRAINT "supplier_receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;