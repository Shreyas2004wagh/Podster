-- Add expected multipart part count to upload targets
ALTER TABLE "upload_targets"
ADD COLUMN "part_count" INTEGER NOT NULL DEFAULT 0;
