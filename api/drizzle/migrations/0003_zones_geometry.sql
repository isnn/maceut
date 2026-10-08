-- The PostGIS column Drizzle cannot express (ADR-011).
--
-- Kept out of drizzle/schema.ts deliberately: there is no native Drizzle type for
-- `geometry`, and declaring it as something else would make the next
-- `drizzle-kit generate` try to alter or drop it. It is written and read through
-- `sql` templates with ST_GeomFromGeoJSON / ST_AsGeoJSON instead.
--
-- SRID 4326 (WGS84) is fixed by BR-013 and enforced by the column type, so a polygon
-- in any other projection is rejected by the database rather than silently stored and
-- drawn in the wrong place.
ALTER TABLE "zones" ADD COLUMN IF NOT EXISTS "geometry" geometry(Polygon, 4326) NOT NULL;
--> statement-breakpoint

-- Spatial index. Not needed for today's queries, which fetch a zone by id, but every
-- spatial lookup the capture pipeline will do (which zones contain this point, which
-- overlap this bbox) scans without it.
CREATE INDEX IF NOT EXISTS "zones_geometry_idx" ON "zones" USING GIST ("geometry");
