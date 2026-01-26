-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('DRAFT', 'LIVE', 'UPLOADING', 'COMPLETE');

-- CreateEnum
CREATE TYPE "track_kind" AS ENUM ('AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "storage_provider" AS ENUM ('S3', 'R2', 'LOCAL');

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255) NOT NULL,
    "status" "session_status" NOT NULL DEFAULT 'DRAFT',
    "host_id" VARCHAR(255) NOT NULL,
    "guest_token" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "kind" "track_kind" NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "parts" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_targets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "upload_id" VARCHAR(255) NOT NULL,
    "key" VARCHAR(500) NOT NULL,
    "bucket" VARCHAR(255) NOT NULL,
    "provider" "storage_provider" NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_sessions_host_id" ON "sessions"("host_id");

-- CreateIndex
CREATE INDEX "idx_sessions_status" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "idx_tracks_session_id" ON "tracks"("session_id");

-- CreateIndex
CREATE INDEX "idx_tracks_user_id" ON "tracks"("user_id");

-- CreateIndex
CREATE INDEX "idx_upload_targets_session_id" ON "upload_targets"("session_id");

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_targets" ADD CONSTRAINT "upload_targets_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;