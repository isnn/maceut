ALTER TABLE "plan_changes" DROP CONSTRAINT "plan_changes_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "plan_changes" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_changes" ADD COLUMN "user_email" text;--> statement-breakpoint
ALTER TABLE "plan_changes" ADD COLUMN "changed_by_email" text;--> statement-breakpoint
UPDATE "plan_changes" pc SET "user_email" = u."email" FROM "user" u WHERE u."id" = pc."user_id";--> statement-breakpoint
UPDATE "plan_changes" pc SET "changed_by_email" = u."email" FROM "user" u WHERE u."id" = pc."changed_by";--> statement-breakpoint
ALTER TABLE "plan_changes" ALTER COLUMN "user_email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_changes" ADD CONSTRAINT "plan_changes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
