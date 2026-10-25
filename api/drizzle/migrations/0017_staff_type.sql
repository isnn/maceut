-- FE-34: staff accounts are a Superadmin (everything) or an Admin (Overview + Users, plan
-- changes only). Meaningful only when role = 'internal'. Every existing staff account was
-- all-powerful, so it starts as a superadmin; nobody loses access by this migration.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "staff_type" text;
--> statement-breakpoint
UPDATE "user" SET "staff_type" = 'superadmin' WHERE "role" = 'internal' AND "staff_type" IS NULL;
