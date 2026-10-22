ALTER TYPE "public"."notification_type" ADD VALUE 'auto_renew_failed';--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "auto_renew_setup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "subscription_id" text;--> statement-breakpoint
ALTER TABLE "user_plans" ADD COLUMN "auto_renew" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_plans" ADD COLUMN "midtrans_subscription_id" text;