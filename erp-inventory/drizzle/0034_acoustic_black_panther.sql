CREATE TABLE "parked_carts" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_line_id" integer NOT NULL,
	"doc_type" text NOT NULL,
	"customer_id" integer,
	"customer_name" text,
	"commercial_id" integer,
	"commercial_name" text,
	"payload" jsonb NOT NULL,
	"actor_name" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "parked_carts" ADD CONSTRAINT "parked_carts_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;