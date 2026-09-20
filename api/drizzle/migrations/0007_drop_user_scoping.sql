ALTER TABLE "user_plans" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "user_plans" CASCADE;--> statement-breakpoint
ALTER TABLE "zones" DROP CONSTRAINT "zones_user_id_name_unique";--> statement-breakpoint
ALTER TABLE "zones" DROP CONSTRAINT "zones_user_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "zones_user_id_idx";--> statement-breakpoint
ALTER TABLE "zones" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "zones" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_workspace_id_name_unique" UNIQUE("workspace_id","name");--> statement-breakpoint

-- Case-insensitive uniqueness for workspace membership, which Drizzle cannot express.
-- Without it, inviting "Budi@dishub.go.id" to a workspace that already has
-- "budi@dishub.go.id" creates a second membership row, and the seat limit counts them
-- twice while the person sees a duplicate of themselves in the team list.
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_members_workspace_email_unique"
  ON "workspace_members" ("workspace_id", lower("email"));
