CREATE TABLE "accounting_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"locked_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "accounting_periods_year_month_unique" UNIQUE("year","month")
);
