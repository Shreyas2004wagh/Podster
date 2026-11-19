ALTER TABLE "tracks"
ADD COLUMN "upload_id" VARCHAR(255);

CREATE UNIQUE INDEX "tracks_upload_id_key" ON "tracks"("upload_id");
