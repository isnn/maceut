-- Reusing rendered work in exports (EXP-A2).
--
-- captures.traffic_slim: the traffic reduced to lines + colours, written once at
-- collection so exports and playback stop slimming the full GeoJSON per frame. Older
-- rows stay null and are filled in on first read.
-- render_cache: export frames already rendered, by (style hash, capture), so retries
-- and repeat exports reuse them. Files in R2 under render-cache/, kept 7 days.

ALTER TABLE "captures" ADD COLUMN IF NOT EXISTS "traffic_slim" jsonb;

CREATE TABLE IF NOT EXISTS "render_cache" (
  "spec_hash"  text NOT NULL,
  "capture_id" uuid NOT NULL REFERENCES "captures"("id") ON DELETE CASCADE,
  "user_id"    text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "path"       text NOT NULL,
  "size"       integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("spec_hash", "capture_id")
);
CREATE INDEX IF NOT EXISTS "render_cache_created_idx" ON "render_cache" ("created_at");
CREATE INDEX IF NOT EXISTS "render_cache_user_idx" ON "render_cache" ("user_id");
