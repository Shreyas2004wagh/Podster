import { SessionStatus, TrackKind, StorageProvider } from "@prisma/client";
import type { IStorageProvider } from "../storage/storageProvider.js";
import { UploadedParts } from "../types/upload.js";
import { 
  type ISessionRepository, 
  type ITrackRepository, 
  type IUploadTargetRepository,
  CreateSessionInput,
  CreateTrackInput,
  CreateUploadTargetInput,
  SessionId
} from "../repositories/index.js";
import { ISessionService } from "./ISessionService.js";
import { ILogger, createChildLogger } from "../config/logger.js";
import { IMetrics, PrometheusMetrics } from "../config/metrics.js";
import { env } from "../config/env.js";
import { StorageObjectNotFoundError, StorageProviderError } from "../storage/errors.js";
import {
  DownloadUrlGenerationError,
  InvalidUploadPartsError,
  RecordingNotFoundError,
  RecordingUrlGenerationError,
  SessionConflictError,
  SessionNotFoundError,
  TrackNotFoundError,
  TrackStorageMissingError,
  TrackNotUploadedError,
  TrackSessionMismatchError,
  UploadOwnershipError,
  UploadTargetExpiredError,
  UploadTargetNotFoundError,
  UploadTargetSessionMismatchError,
  UploadTrackNotFoundError
} from "./errors.js";

const RECORDING_URL_TTL_SECONDS = 60 * 60;
const UPLOAD_TARGET_TTL_SECONDS = RECORDING_URL_TTL_SECONDS;

function normalizeMultipartParts(parts: UploadedParts, expectedPartCount: number): UploadedParts {
  if (!Number.isInteger(expectedPartCount) || expectedPartCount < 1) {
    throw new InvalidUploadPartsError("Invalid upload target part count");
  }

  if (!Array.isArray(parts) || parts.length === 0) {
    throw new InvalidUploadPartsError("Upload parts are required");
  }

  if (parts.length !== expectedPartCount) {
    throw new InvalidUploadPartsError("Upload part count does not match the expected count");
  }

  const normalizedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  const seenPartNumbers = new Set<number>();

  normalizedParts.forEach((part, index) => {
    if (!Number.isInteger(part.partNumber) || part.partNumber < 1 || part.partNumber > expectedPartCount) {
      throw new InvalidUploadPartsError("Upload part number is invalid");
    }

    if (seenPartNumbers.has(part.partNumber)) {
      throw new InvalidUploadPartsError("Upload parts must be unique");
    }
    seenPartNumbers.add(part.partNumber);

    if (part.partNumber !== index + 1) {
      throw new InvalidUploadPartsError("Upload parts must be contiguous and start at 1");
    }
  });

  return normalizedParts;
}

export class SessionService implements ISessionService {
  private readonly logger: ILogger;
  private readonly metrics: IMetrics;

  constructor(
    private readonly sessionRepository: ISessionRepository,
    private readonly trackRepository: ITrackRepository,
    private readonly uploadTargetRepository: IUploadTargetRepository,
    private readonly storage: IStorageProvider
  ) {
    this.logger = createChildLogger({ service: "SessionService" });
    this.metrics = new PrometheusMetrics();
  }

  async createSession(input: CreateSessionInput) {
    const startTime = Date.now();
    
    try {
      this.logger.info({
        event: "session_creation_start",
        input: { title: input.title, hostId: input.hostId },
      }, "Creating new session");

      const session = await this.sessionRepository.create(input);
      
      const duration = Date.now() - startTime;
      this.logger.info({
        event: "session_created",
        sessionId: session.id,
        title: session.title,
        hostId: session.hostId,
        duration,
      }, `Session created successfully in ${duration}ms`);

      // Record metrics
      this.metrics.recordSessionCreated("success");

      return session;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error({
        event: "session_creation_failed",
        input: { title: input.title, hostId: input.hostId },
        duration,
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack,
        },
      }, `Session creation failed after ${duration}ms`);
      
      // Record metrics
      this.metrics.recordSessionCreated("failure");
      
      throw error;
    }
  }

  async getSession(sessionId: SessionId) {
    const startTime = Date.now();
    
    try {
      this.logger.debug({
        event: "session_retrieval_start",
        sessionId,
      }, "Retrieving session");

      const session = await this.sessionRepository.findByIdWithTracks(sessionId);
      
      const duration = Date.now() - startTime;
      if (session) {
        this.logger.debug({
          event: "session_retrieved",
          sessionId,
          trackCount: session.tracks.length,
          duration,
        }, `Session retrieved in ${duration}ms`);
      } else {
        this.logger.warn({
          event: "session_not_found",
          sessionId,
          duration,
        }, `Session not found after ${duration}ms`);
      }

      return session;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error({
        event: "session_retrieval_failed",
        sessionId,
        duration,
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack,
        },
      }, `Session retrieval failed after ${duration}ms`);
      throw error;
    }
  }

  async requestUploadUrls(sessionId: SessionId, uploaderId: string, partCount: number) {
    const startTime = Date.now();
    
    try {
      this.logger.info({
        event: "upload_request_start",
        sessionId,
        partCount,
      }, "Requesting upload URLs");

      const session = await this.sessionRepository.findById(sessionId);
      if (!session) {
        this.logger.warn({
          event: "upload_request_session_not_found",
          sessionId,
        }, "Session not found for upload request");
        throw new SessionNotFoundError(sessionId);
      }

      const [existingUploadTargets, incompleteTracks] = await Promise.all([
        this.uploadTargetRepository.findBySessionId(sessionId),
        this.trackRepository.findIncompleteTracks(sessionId)
      ]);

      const incompleteTracksForUploader = incompleteTracks.filter((track) => track.userId === uploaderId);
      const staleTrackKeys = new Set(incompleteTracksForUploader.map((track) => track.objectKey));
      const now = new Date();
      const activeUploadTarget = existingUploadTargets.find(
        (target) => staleTrackKeys.has(target.key) && target.expiresAt > now
      );

      if (activeUploadTarget) {
        this.logger.warn(
          {
            event: "upload_request_duplicate_active_upload",
            sessionId,
            uploaderId,
            uploadId: activeUploadTarget.uploadId
          },
          "Upload request rejected because an active upload already exists for this participant"
        );
        throw new SessionConflictError("An upload is already in progress for this participant");
      }

      const staleUploadTargets = existingUploadTargets.filter((target) => staleTrackKeys.has(target.key));
      if (staleUploadTargets.length > 0 || incompleteTracksForUploader.length > 0) {
        await Promise.all([
          ...staleUploadTargets.map((target) => this.uploadTargetRepository.delete(target.id)),
          ...incompleteTracksForUploader.map((track) => this.trackRepository.delete(track.id))
        ]);
      }
      
      const key = `sessions/${sessionId}/${uploaderId}/${Date.now()}.webm`;
      const { uploadId, urls } = await this.storage.createMultipartUpload({ key, partCount });

      let statusChanged = false;
      let createdUploadTargetId: string | null = null;
      let createdTrackId: string | null = null;

      try {
        if (session.status !== SessionStatus.UPLOADING) {
          await this.sessionRepository.update(sessionId, {
            status: SessionStatus.UPLOADING
          });
          statusChanged = true;
        }

        const uploadTargetInput: CreateUploadTargetInput = {
          sessionId,
          uploadId,
          key,
          bucket: env.STORAGE_BUCKET,
          provider: this.resolveStorageProvider(),
          expiresAt: new Date(Date.now() + UPLOAD_TARGET_TTL_SECONDS * 1000),
          partCount
        };
        const uploadTarget = await this.uploadTargetRepository.create(uploadTargetInput);
        createdUploadTargetId = uploadTarget.id;

        const trackInput: CreateTrackInput = {
          sessionId,
          userId: uploaderId,
          kind: TrackKind.VIDEO,
          objectKey: key
        };
        const track = await this.trackRepository.create(trackInput);
        createdTrackId = track.id;

        const duration = Date.now() - startTime;
        this.logger.info({
          event: "upload_urls_generated",
          sessionId,
          trackId: track.id,
          uploadId,
          partCount,
          duration,
        }, `Upload URLs generated in ${duration}ms`);

        return { uploadId, urls, trackId: track.id, objectKey: key };
      } catch (error) {
        const rollbackOperations: Promise<unknown>[] = [
          this.storage.abortMultipartUpload({ key, uploadId })
        ];

        if (createdTrackId) {
          rollbackOperations.push(this.trackRepository.delete(createdTrackId));
        }

        if (createdUploadTargetId) {
          rollbackOperations.push(this.uploadTargetRepository.delete(createdUploadTargetId));
        }

        if (statusChanged) {
          rollbackOperations.push(
            this.sessionRepository.update(sessionId, {
              status: session.status
            })
          );
        }

        const rollbackResults = await Promise.allSettled(rollbackOperations);
        const rollbackFailures = rollbackResults.filter((result) => result.status === "rejected");
        if (rollbackFailures.length > 0) {
          this.logger.error({
            event: "upload_request_rollback_failed",
            sessionId,
            uploadId,
            rollbackFailures: rollbackFailures.map((result) => ({
              name: result.reason instanceof Error ? result.reason.name : "UnknownError",
              message: result.reason instanceof Error ? result.reason.message : String(result.reason)
            }))
          }, "Rollback after upload request failure did not complete cleanly");
        }

        throw error;
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error({
        event: "upload_request_failed",
        sessionId,
        partCount,
        duration,
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack,
        },
      }, `Upload request failed after ${duration}ms`);
      throw error;
    }
  }

  async completeUpload(sessionId: SessionId, uploadId: string, parts: UploadedParts, uploaderId: string) {
    const startTime = Date.now();
    
    try {
      this.logger.info({
        event: "upload_completion_start",
        sessionId,
        uploadId,
        partsCount: parts?.length,
      }, "Completing upload");
      
      const session = await this.sessionRepository.findByIdWithTracks(sessionId);
      if (!session) {
        this.logger.warn({
          event: "upload_completion_session_not_found",
          sessionId,
          uploadId,
        }, "Session not found for upload completion");
        throw new SessionNotFoundError(sessionId);
      }

      const uploadTarget = await this.uploadTargetRepository.findByUploadId(uploadId);
      if (!uploadTarget) {
        this.logger.warn({
          event: "upload_completion_target_missing",
          sessionId,
          uploadId
        }, "Upload target not found for upload completion");
        throw new UploadTargetNotFoundError(uploadId);
      }

      if (uploadTarget.sessionId !== sessionId) {
        this.logger.warn({
          event: "upload_completion_target_session_mismatch",
          sessionId,
          uploadId,
          targetSessionId: uploadTarget.sessionId
        }, "Upload target does not belong to session");
        throw new UploadTargetSessionMismatchError(sessionId, uploadId);
      }

      if (uploadTarget.expiresAt < new Date()) {
        this.logger.warn({
          event: "upload_completion_target_expired",
          sessionId,
          uploadId,
          expiresAt: uploadTarget.expiresAt
        }, "Upload target expired before completion");
        throw new UploadTargetExpiredError(uploadId);
      }

      const track = session.tracks.find((existingTrack) => existingTrack.objectKey === uploadTarget.key);
      if (!track) {
        this.logger.warn({
          event: "upload_completion_track_missing",
          sessionId,
          uploadId
        }, "Track missing for upload completion");
        throw new UploadTrackNotFoundError(uploadId);
      }

      if (track.userId !== uploaderId) {
        this.logger.warn({
          event: "upload_completion_user_mismatch",
          sessionId,
          uploadId,
          uploaderId,
          trackUserId: track.userId
        }, "Upload target does not belong to the authenticated user");
        throw new UploadOwnershipError(uploadId);
      }

      if (track.completedAt) {
        this.logger.info(
          {
            event: "upload_completion_already_finalized",
            sessionId,
            trackId: track.id,
            uploadId
          },
          "Upload was already finalized; cleaning up stale upload target metadata"
        );

        await this.uploadTargetRepository.delete(uploadTarget.id);
        await this.syncSessionUploadStatus(sessionId, session.status);
        return this.sessionRepository.findByIdWithTracks(sessionId);
      }

      const normalizedParts = normalizeMultipartParts(parts ?? [], uploadTarget.partCount);
      
      this.logger.debug({
        event: "s3_multipart_completion_start",
        key: track.objectKey,
        uploadId,
        partsCount: normalizedParts.length,
      }, "Completing S3 multipart upload");
      
      await this.storage.completeMultipartUpload({
        key: uploadTarget.key,
        uploadId,
        parts: normalizedParts
      });
      
      this.logger.debug({
        event: "s3_multipart_completed",
        key: track.objectKey,
        uploadId,
      }, "S3 multipart upload completed");
      
      // Mark track as completed
      await this.trackRepository.markCompleted(track.id, normalizedParts);

      await this.uploadTargetRepository.delete(uploadTarget.id);

      await this.syncSessionUploadStatus(sessionId, session.status);
      
      const finalSession = await this.sessionRepository.findByIdWithTracks(sessionId);
      
      const duration = Date.now() - startTime;
      this.logger.info({
        event: "upload_completed",
        sessionId,
        trackId: track.id,
        uploadId,
        duration,
      }, `Upload completed successfully in ${duration}ms`);
      
      return finalSession;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error({
        event: "upload_completion_failed",
        sessionId,
        uploadId,
        partsCount: parts?.length,
        duration,
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack,
        },
      }, `Upload completion failed after ${duration}ms`);
      throw error;
    }
  }

  async markLive(sessionId: SessionId) {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    if (session.status !== SessionStatus.LIVE) {
      await this.sessionRepository.update(sessionId, { status: SessionStatus.LIVE });
    }
    return this.sessionRepository.findByIdWithTracks(sessionId);
  }

  async getDownloadUrl(sessionId: SessionId, trackId: string): Promise<string> {
    const track = await this.trackRepository.findById(trackId);
    if (!track) {
      throw new TrackNotFoundError(trackId);
    }
    if (track.sessionId !== sessionId) {
      throw new TrackSessionMismatchError(sessionId, trackId);
    }
    if (!track.completedAt) {
      throw new TrackNotUploadedError(trackId);
    }

    try {
      return await this.storage.getSignedDownloadUrl({ key: track.objectKey });
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError) {
        throw new TrackStorageMissingError(trackId);
      }

      this.logger.error(
        {
          event: "download_url_generation_failed",
          sessionId,
          trackId,
          objectKey: track.objectKey,
          error: {
            name: (error as Error).name,
            message: (error as Error).message
          }
        },
        "Failed to generate track download URL"
      );

      if (error instanceof StorageProviderError) {
        throw new DownloadUrlGenerationError(trackId, error);
      }

      throw error;
    }
  }

  async getRecordingUrl(sessionId: SessionId): Promise<string> {
    const session = await this.sessionRepository.findByIdWithTracks(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    const latestCompletedRecording = [...session.tracks]
      .sort((left, right) => {
        const leftCompletedAt = left.completedAt ? new Date(left.completedAt).getTime() : 0;
        const rightCompletedAt = right.completedAt ? new Date(right.completedAt).getTime() : 0;

        if (rightCompletedAt !== leftCompletedAt) {
          return rightCompletedAt - leftCompletedAt;
        }

        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      })
      .find(
        (track) =>
          track.kind === TrackKind.VIDEO &&
          Boolean(track.completedAt) &&
          track.objectKey.endsWith(".webm")
      );

    if (!latestCompletedRecording) {
      throw new RecordingNotFoundError(sessionId);
    }

    try {
      return await this.storage.getSignedDownloadUrl({
        key: latestCompletedRecording.objectKey,
        expiresInSeconds: RECORDING_URL_TTL_SECONDS
      });
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError) {
        throw new RecordingNotFoundError(sessionId);
      }

      this.logger.error(
        {
          event: "recording_url_generation_failed",
          sessionId,
          objectKey: latestCompletedRecording.objectKey,
          error: {
            name: (error as Error).name,
            message: (error as Error).message
          }
        },
        "Failed to generate recording URL"
      );

      if (error instanceof StorageProviderError) {
        throw new RecordingUrlGenerationError(sessionId, error);
      }

      throw error;
    }
  }

  private resolveStorageProvider(): StorageProvider {
    switch (process.env.STORAGE_PROVIDER) {
      case "r2":
        return StorageProvider.R2;
      case "local":
        return StorageProvider.LOCAL;
      case "s3":
      default:
        return StorageProvider.S3;
    }
  }

  private async syncSessionUploadStatus(sessionId: SessionId, previousStatus: SessionStatus) {
    const [incompleteTracks, remainingUploadTargets] = await Promise.all([
      this.trackRepository.findIncompleteTracks(sessionId),
      this.uploadTargetRepository.findBySessionId(sessionId)
    ]);

    if (incompleteTracks.length === 0 && remainingUploadTargets.length === 0) {
      await this.sessionRepository.update(sessionId, {
        status: SessionStatus.COMPLETE
      });
      return;
    }

    if (previousStatus !== SessionStatus.UPLOADING) {
      await this.sessionRepository.update(sessionId, {
        status: SessionStatus.UPLOADING
      });
    }
  }
}
