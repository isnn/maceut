-- PostGIS, plus the email uniqueness rule Drizzle's schema cannot express.

-- Required before any zone can be stored: zones.geometry is geometry(Polygon, 4326)
-- and every spatial query needs the extension. The postgis/postgis image creates it
-- in the default database already, but a managed Postgres or a second database will
-- not have it, and the failure would otherwise surface at the first zone insert.
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint

-- Better Auth's generated schema gives "user"."email" a plain UNIQUE, which is
-- case-sensitive. Without this index, "Budi@maceut.id" and "budi@maceut.id" are two
-- separate accounts, and which one a person reaches depends on how they typed it.
--
-- Better Auth normalises on its own paths, but the database is where the guarantee
-- belongs: a bulk import, a support script or a psql session bypasses it entirely.
-- A functional unique index is strictly stronger than the plain one, so the original
-- is dropped rather than kept alongside it at a cost on every write.
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_email_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_lower_unique" ON "user" (lower("email"));
