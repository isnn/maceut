-- Exports (FE-21): Studio ZIP/WebM exports rendered by the worker, not the browser tab.
--
-- The row is the single source of truth for an export's progress. The worker writes
-- `frames_done` and touches `updated_at` as it renders; every progress bar reads this
-- row. `updated_at` doubles as a heartbeat: the sweeper fails a render whose heartbeat
-- has stopped, so a worker killed mid-job leaves a clear failure, not a frozen bar.

CREATE TYPE "export_format" AS ENUM ('zip', 'webm');
CREATE TYPE "export_status" AS ENUM ('queued', 'rendering', 'uploading', 'done', 'failed', 'expired');

CREATE TABLE IF NOT EXISTS "exports" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "zone_id"      uuid NOT NULL REFERENCES "zones"("id") ON DELETE CASCADE,
  "format"       "export_format" NOT NULL,
  "status"       "export_status" NOT NULL DEFAULT 'queued',

  -- Render settings as Studio showed them; themes by id, resolved by the renderer.
  "spec"         jsonb NOT NULL,
  -- Frozen at request time, so later captures can't change what the file contains.
  "frame_ids"    jsonb NOT NULL,
  "frame_count"  integer NOT NULL,
  "frames_done"  integer NOT NULL DEFAULT 0,

  "file_path"    text,
  "file_size"    integer,
  "error"        text,

  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "started_at"   timestamptz,
  "updated_at"   timestamptz NOT NULL DEFAULT now(),
  "finished_at"  timestamptz,
  "expires_at"   timestamptz
);

CREATE INDEX IF NOT EXISTS "exports_zone_created_idx" ON "exports" ("zone_id", "created_at");
CREATE INDEX IF NOT EXISTS "exports_user_status_idx" ON "exports" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "exports_status_idx" ON "exports" ("status");
