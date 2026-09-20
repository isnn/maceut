-- Move every existing account into its own workspace, without losing anything.
--
-- Runs between the additive migration (0005) and the destructive one (0007), so at
-- this point both the old columns and the new ones exist. Splitting it that way is
-- what makes the data movement a plain INSERT/UPDATE rather than something that has
-- to happen inside a column rename.
--
-- Written by hand rather than generated: drizzle-kit would have dropped user_plans
-- and created workspace_plans as unrelated tables, silently discarding which plan
-- each account is on.

-- 1. One personal workspace per user.
--
-- Named after the organisation they gave at sign-up when there is one, since that is
-- what a Dishub user would expect to see at the top of the screen; otherwise their
-- own name. The id is derived deterministically from the user id via uuid_generate_v5
-- semantics — but rather than depend on uuid-ossp, we just insert and join back on
-- the name/owner pair below.
INSERT INTO workspaces (id, name, created_at, updated_at)
SELECT
  gen_random_uuid(),
  COALESCE(NULLIF(TRIM(u.organisation), ''), u.name, split_part(u.email, '@', 1)),
  u.created_at,
  NOW()
FROM "user" u
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_members m WHERE m.user_id = u.id AND m.role = 'owner'
);
--> statement-breakpoint

-- 2. Make each user the owner of the workspace just created for them.
--
-- Matched on creation timestamp + name, which is unambiguous because step 1 copied
-- the user's own created_at onto the workspace and runs exactly once.
INSERT INTO workspace_members (workspace_id, user_id, email, role, status, invited_at, joined_at)
SELECT w.id, u.id, u.email, 'owner', 'active', u.created_at, u.created_at
FROM "user" u
JOIN workspaces w
  ON w.created_at = u.created_at
 AND w.name = COALESCE(NULLIF(TRIM(u.organisation), ''), u.name, split_part(u.email, '@', 1))
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_members m WHERE m.user_id = u.id AND m.workspace_id = w.id
);
--> statement-breakpoint

-- 3. Carry each account's plan across to its workspace.
--
-- This is the row that matters: without it every account silently drops to `free`,
-- and a premium customer would lose their limits with no error anywhere.
INSERT INTO workspace_plans (workspace_id, plan, started_at, expires_at, created_at)
SELECT m.workspace_id, p.plan, p.started_at, p.expires_at, p.created_at
FROM user_plans p
JOIN workspace_members m ON m.user_id = p.user_id AND m.role = 'owner'
ON CONFLICT (workspace_id) DO NOTHING;
--> statement-breakpoint

-- 4. Point existing zones at their owner's workspace.
--
-- No zones exist at the time of writing, but this must be correct for any environment
-- that does have them — a migration that only works on an empty database is not a
-- migration.
UPDATE zones z
SET workspace_id = m.workspace_id,
    created_by   = z.user_id
FROM workspace_members m
WHERE m.user_id = z.user_id
  AND m.role = 'owner'
  AND z.workspace_id IS NULL;
--> statement-breakpoint

-- 5. Default everyone's active workspace to their personal one.
INSERT INTO user_preferences (user_id, active_workspace_id, updated_at)
SELECT m.user_id, m.workspace_id, NOW()
FROM workspace_members m
WHERE m.role = 'owner' AND m.user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
--> statement-breakpoint

-- 6. Refuse to continue if anything was left behind.
--
-- A backfill that half-works is worse than one that fails: the drops in 0007 would
-- then destroy the only remaining copy. These raise and roll back the transaction.
DO $$
DECLARE
  orphan_users   int;
  orphan_plans   int;
  orphan_zones   int;
BEGIN
  SELECT COUNT(*) INTO orphan_users
  FROM "user" u
  WHERE NOT EXISTS (SELECT 1 FROM workspace_members m WHERE m.user_id = u.id AND m.role = 'owner');

  SELECT COUNT(*) INTO orphan_plans
  FROM user_plans p
  WHERE NOT EXISTS (
    SELECT 1 FROM workspace_members m
    JOIN workspace_plans wp ON wp.workspace_id = m.workspace_id
    WHERE m.user_id = p.user_id AND m.role = 'owner' AND wp.plan = p.plan
  );

  SELECT COUNT(*) INTO orphan_zones FROM zones WHERE workspace_id IS NULL;

  IF orphan_users > 0 THEN
    RAISE EXCEPTION 'backfill incomplete: % user(s) have no owning workspace', orphan_users;
  END IF;
  IF orphan_plans > 0 THEN
    RAISE EXCEPTION 'backfill incomplete: % plan(s) did not carry across', orphan_plans;
  END IF;
  IF orphan_zones > 0 THEN
    RAISE EXCEPTION 'backfill incomplete: % zone(s) have no workspace', orphan_zones;
  END IF;
END $$;
