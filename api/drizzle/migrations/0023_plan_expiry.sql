ALTER TYPE "public"."notification_type" ADD VALUE 'plan_expiring';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'plan_expired';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'payment_failed';--> statement-breakpoint
ALTER TABLE "user_plans" ADD COLUMN "reminded_at" timestamp with time zone;