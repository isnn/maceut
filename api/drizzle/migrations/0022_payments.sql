CREATE TYPE "public"."payment_status" AS ENUM('creating', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded');--> statement-breakpoint
ALTER TYPE "public"."plan_change_source" ADD VALUE 'payment';--> statement-breakpoint
ALTER TYPE "public"."plan_change_source" ADD VALUE 'expiry';--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"order_id" text NOT NULL,
	"plan" "plan" NOT NULL,
	"amount" integer NOT NULL,
	"status" "payment_status" DEFAULT 'creating' NOT NULL,
	"snap_token" text,
	"redirect_url" text,
	"provider_status" text,
	"payment_type" text,
	"transaction_id" text,
	"paid_at" timestamp with time zone,
	"period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_user_created_idx" ON "payments" USING btree ("user_id","created_at");