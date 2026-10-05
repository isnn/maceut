-- Streamed exports (EXP-A1).
--
-- upload_id: the R2 multipart upload an export's file streams into while it renders,
-- so the sweeper can abort one whose worker died. Null when none is in progress.
-- file_size → bigint: a streamed ZIP can now pass integer's 2.1 GB ceiling.

ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "upload_id" text;
ALTER TABLE "exports" ALTER COLUMN "file_size" TYPE bigint;
