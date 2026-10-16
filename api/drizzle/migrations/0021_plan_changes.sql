CREATE TYPE "public"."plan_change_source" AS ENUM('self', 'staff');--> statement-breakpoint
CREATE TABLE "plan_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"from_plan" "plan",
	"to_plan" "plan" NOT NULL,
	"source" "plan_change_source" NOT NULL,
	"changed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_changes" ADD CONSTRAINT "plan_changes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_changes" ADD CONSTRAINT "plan_changes_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_changes_user_created_idx" ON "plan_changes" USING btree ("user_id","created_at");