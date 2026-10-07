-- Video exports through ffmpeg (EXP-B): MP4 (H.264) alongside WebM (VP9).
ALTER TYPE "export_format" ADD VALUE IF NOT EXISTS 'mp4';
