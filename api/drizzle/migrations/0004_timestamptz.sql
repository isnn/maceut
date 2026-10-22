-- Convert Better Auth's tables from `timestamp` to `timestamptz`.
--
-- The CLI emits bare `timestamp(...)`, i.e. WITHOUT time zone: the value carries no
-- offset, so it means whatever the reading process assumes. That is fine while every
-- container is UTC and silently wrong the first time one is not — and
-- `session.expires_at` deciding when a login ends is the worst place to find out.
--
-- ⚠️ The USING clauses are load-bearing. Without them Postgres interprets each naive
-- value in the SESSION's TimeZone setting, so the same migration produces different
-- data depending on who runs it: correct under Etc/UTC, seven hours off under
-- Asia/Jakarta. Naming UTC explicitly makes the conversion deterministic.
--
-- Naming UTC is correct for the existing rows: both the api container and Postgres run
-- UTC, and the stored values were checked against real UTC before writing this.

ALTER TABLE "user"
  ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint

ALTER TABLE "session"
  ALTER COLUMN "expires_at" TYPE timestamptz USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint

ALTER TABLE "account"
  ALTER COLUMN "access_token_expires_at" TYPE timestamptz USING "access_token_expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "refresh_token_expires_at" TYPE timestamptz USING "refresh_token_expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint

ALTER TABLE "verification"
  ALTER COLUMN "expires_at" TYPE timestamptz USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "updated_at" SET DEFAULT now();
