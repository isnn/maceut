-- HERE usage metering and runtime platform settings (admin: HERE budget cap).
--
-- here_usage: one row per WIB day per source, incremented on every HERE call
-- (INSERT ... ON CONFLICT DO UPDATE). `refused` counts calls the budget cap stopped
-- before they were sent.
--
-- platform_settings: runtime-editable operational values (the HERE budget) — not
-- secrets, so outside ADR-018's read-only .env mirror.

CREATE TABLE IF NOT EXISTS "here_usage" (
  "day"        date NOT NULL,
  "source"     text NOT NULL,
  "requests"   integer NOT NULL DEFAULT 0,
  "failed"     integer NOT NULL DEFAULT 0,
  "refused"    integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("day", "source")
);

CREATE TABLE IF NOT EXISTS "platform_settings" (
  "key"        text PRIMARY KEY,
  "value"      jsonb NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" text REFERENCES "user"("id") ON DELETE SET NULL
);
