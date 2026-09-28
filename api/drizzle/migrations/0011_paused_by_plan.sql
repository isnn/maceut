-- Who paused it (ADR-020): true when a plan change paused the zone or window, false
-- when the user did (or it isn't paused). Lets the app say "paused because of your
-- plan" — and what it takes to resume — instead of a bare "paused".
--
-- Existing paused rows default to false: which of them a past downgrade paused was
-- never recorded, and claiming it now would be a guess.

ALTER TABLE "zones" ADD COLUMN IF NOT EXISTS "paused_by_plan" boolean NOT NULL DEFAULT false;
ALTER TABLE "schedules" ADD COLUMN IF NOT EXISTS "paused_by_plan" boolean NOT NULL DEFAULT false;
