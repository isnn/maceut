-- Notifications (NOTIF): the in-app bell, the one email preference, and the email log.
--
-- notifications: one row per event worth telling a user; (user_id, dedupe_key) is
-- unique so re-reporting the same event inserts nothing. The email_* columns carry the
-- delayed-email decision (see notification.service).
-- notification_preferences: one switch per user; no row = defaults.
-- email_log: every email attempted — cost meter, OTP send limits, alert dedupe. Never
-- the body or a code.

DO $$ BEGIN
  CREATE TYPE "notification_type" AS ENUM (
    'capture_failing', 'capture_recovered', 'captures_missed', 'capture_limit_reached',
    'capture_limit_near', 'export_ready', 'export_failed', 'plan_changed',
    'here_budget_warning', 'here_budget_reached'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "notification_tone" AS ENUM ('warning', 'success', 'info');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "notification_email_status" AS ENUM ('none', 'pending', 'sent', 'skipped');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "email_log_status" AS ENUM ('sent', 'failed', 'suppressed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "notifications" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"           text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "type"              "notification_type" NOT NULL,
  "tone"              "notification_tone" NOT NULL,
  "title"             text NOT NULL,
  "body"              text NOT NULL,
  "action_label"      text,
  "action_href"       text,
  "data"              jsonb NOT NULL DEFAULT '{}'::jsonb,
  "dedupe_key"        text NOT NULL,
  "read_at"           timestamptz,
  "email_status"      "notification_email_status" NOT NULL DEFAULT 'none',
  "email_due_at"      timestamptz,
  "email_attempts"    integer NOT NULL DEFAULT 0,
  "emailed_at"        timestamptz,
  "email_skip_reason" text,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "notifications_user_dedupe_uq" UNIQUE ("user_id", "dedupe_key")
);
CREATE INDEX IF NOT EXISTS "notifications_user_created_idx" ON "notifications" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "notifications_email_due_idx" ON "notifications" ("email_status", "email_due_at");

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "user_id"                text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "email_capture_problems" boolean NOT NULL DEFAULT true,
  "updated_at"             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "email_log" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "to"         text NOT NULL,
  "category"   text NOT NULL,
  "dedupe_key" text,
  "status"     "email_log_status" NOT NULL,
  "provider"   text NOT NULL,
  "error"      text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "email_log_dedupe_uq" UNIQUE ("dedupe_key")
);
CREATE INDEX IF NOT EXISTS "email_log_to_category_created_idx" ON "email_log" ("to", "category", "created_at");
