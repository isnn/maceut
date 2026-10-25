-- Email verification becomes required to sign in (email OTP, lib/auth.ts). Accounts
-- created before it existed were never asked to verify, and requiring it now would
-- lock every one of them out at their next sign-in. They are marked verified once,
-- here; every account created from now on proves its address with a code.
--
-- Data only — no schema change, so docs/database/schema.dbml is unaffected.

UPDATE "user" SET "email_verified" = true WHERE "email_verified" = false;
