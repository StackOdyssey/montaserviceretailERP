CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"pin_hmac" text NOT NULL,
	"role" text DEFAULT 'CAISSIER' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_pin_hmac_unique" UNIQUE("pin_hmac")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "actor_name" text;