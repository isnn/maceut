-- Captures: one row per cycle a zone collects (BR-009, BR-010).
--
-- Written by hand rather than generated, for the `traffic` column's sake. drizzle-kit
-- emits the same DDL, but not the reason a rendered PNG is not the only artifact: the
-- GeoJSON is what lets the zone page redraw a past cycle on a real map instead of
-- showing a flat picture, and it is the same shape the live preview already renders.
--
-- A row is written for every outcome, not only successes. A plan-limit skip (BR-008)
-- and a failure are both history worth keeping — a zone whose captures quietly stopped
-- is only diagnosable if the stops were written down.

CREATE TYPE "capture_status" AS ENUM ('pending', 'processing', 'done', 'failed', 'skipped_limit');
CREATE TYPE "capture_trigger" AS ENUM ('manual', 'scheduled');

CREATE TABLE IF NOT EXISTS "captures" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"        text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "zone_id"        uuid NOT NULL REFERENCES "zones"("id") ON DELETE CASCADE,

  -- SET NULL, not CASCADE: the frame still happened. Deleting the window that produced
  -- it must not erase the history it produced.
  "schedule_id"    uuid REFERENCES "schedules"("id") ON DELETE SET NULL,

  "status"         "capture_status" NOT NULL DEFAULT 'pending',
  "trigger"        "capture_trigger" NOT NULL,

  -- The class actually collected, after BR-022's cap. Stored per capture because it can
  -- differ from the zone's own class the moment a plan changes, and a frame has to stay
  -- explainable later without replaying the account's plan history.
  "road_class"     "road_class" NOT NULL,

  "traffic"        jsonb,
  "roads_count"    integer,
  "jam_factor_avg" numeric(4, 2),

  -- BR-011 path. Null until an image is rendered; null means "no image yet", never
  -- "no data" — the cycle is complete and displayable from `traffic` either way.
  "file_path"      text,
  "file_size"      integer,
  "style_used"     jsonb,

  "error"          text,

  -- When the traffic was sampled, not when the row was written.
  "captured_at"    timestamptz NOT NULL DEFAULT now(),
  "created_at"     timestamptz NOT NULL DEFAULT now()
);

-- The zone page reads its own history newest-first; this is that query.
CREATE INDEX IF NOT EXISTS "captures_zone_captured_idx" ON "captures" ("zone_id", "captured_at");
-- BR-006 counts a user's captures for the current WIB day.
CREATE INDEX IF NOT EXISTS "captures_user_captured_idx" ON "captures" ("user_id", "captured_at");
CREATE INDEX IF NOT EXISTS "captures_schedule_idx" ON "captures" ("schedule_id");
