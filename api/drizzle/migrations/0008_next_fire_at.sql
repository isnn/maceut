-- Durable firing: the clock moves out of memory and into the database.
--
-- Before this, the scheduler held "which minute did I last handle" in process memory.
-- A restart lost it, so every firing during downtime vanished with no record that it
-- should have happened. The window still said active, the dashboard still predicted
-- "next capture 07:00", and the zone simply had a gap.
--
-- `next_fire_at` makes due work a queryable fact. Three things follow from that:
--   1. A restart resumes exactly where it stopped.
--   2. The scheduler can sleep until the next due moment instead of waking every minute.
--   3. The claim (UPDATE ... WHERE next_fire_at <= now() RETURNING) is itself the lock,
--      so two API instances can no longer both fire the same window.

ALTER TABLE "schedules"
  ADD COLUMN IF NOT EXISTS "next_fire_at" timestamptz;

COMMENT ON COLUMN "schedules"."next_fire_at" IS
  'When this window next fires. NULL means "not computed yet" — the scheduler seeds it without firing, so existing rows do not all fire at once on deploy.';

-- Deliberately left NULL rather than defaulted to now(): now() would make every existing
-- window fire the instant this deploys, all at once, burning each account''s daily limit
-- on frames nobody asked for. NULL means "seed me", and seeding never fires.

-- Partial index: only active windows are ever claimed, and the planner can skip the rest
-- entirely. This is the query that runs on every scheduler wake-up.
CREATE INDEX IF NOT EXISTS "schedules_due_idx"
  ON "schedules" ("next_fire_at")
  WHERE "status" = 'active';

-- Windows still needing a first computation, kept cheap for the same reason.
CREATE INDEX IF NOT EXISTS "schedules_unseeded_idx"
  ON "schedules" ("id")
  WHERE "status" = 'active' AND "next_fire_at" IS NULL;


-- Captures gain the moment they were SUPPOSED to run, which is what makes lateness a
-- fact rather than a guess. `captured_at` alone cannot distinguish a frame taken on time
-- from one taken forty minutes late after an outage — and for traffic data that
-- difference is the whole value of the frame.
ALTER TABLE "captures"
  ADD COLUMN IF NOT EXISTS "scheduled_for" timestamptz;

COMMENT ON COLUMN "captures"."scheduled_for" IS
  'The instant this cycle was due. NULL for manual captures, which are due when asked. Lateness is captured_at - scheduled_for.';

-- A firing the system was down for. Not a failure — nothing was attempted — and not a
-- skip, which means the plan refused it. A gap you can see beats a gap you cannot.
ALTER TYPE "capture_status" ADD VALUE IF NOT EXISTS 'missed';
