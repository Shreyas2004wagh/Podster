import { SessionStatus, TrackKind, StorageProvider } from "@prisma/client";
import type { IStorageProvider } from "../storage/storageProvider.js";
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
  RecordingNotFoundError,
  RecordingUrlGenerationError,
  SessionNotFoundError
} from "./errors.js";

const RECORDING_URL_TTL_SECONDS = 60 * 60;

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

  async requestUploadUrls(sessionId: SessionId, partCount: number) {
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
        throw new Error("Session not found");
      }
      
      const key = `sessions/${sessionId}/${Date.now()}.webm`;
      const { uploadId, urls } = await this.storage.createMultipartUpload({ key, partCount });

      // Update session status if it isn't already uploading
      if (session.status === SessionStatus.DRAFT || session.status === SessionStatus.LIVE) {
        await this.sessionRepository.update(sessionId, { 
          status: SessionStatus.UPLOADING 
        });
        
        // Create upload target
        const uploadTargetInput: CreateUploadTargetInput = {
          sessionId,
          uploadId,
          key,
          bucket: env.STORAGE_BUCKET,
          provider: this.resolveStorageProvider(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        };
        await this.uploadTargetRepository.create(uploadTargetInput);
      }

      // Create track
      const trackInput: CreateTrackInput = {
        sessionId,
        userId: session.hostId,
        kind: TrackKind.VIDEO,
        objectKey: key
      };
      const track = await this.trackRepository.create(trackInput);

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

  async completeUpload(sessionId: SessionId, uploadId: string, parts: any[]) {
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
        throw new Error("Session not found");
      }
      
      const track = session.tracks[0];
      if (!track) {
        this.logger.warn({
          event: "upload_completion_track_missing",
          sessionId,
          uploadId,
        }, "Track missing for upload completion");
        throw new Error("Track missing for upload completion");
      }
      
      this.logger.debug({
        event: "s3_multipart_completion_start",
        key: track.objectKey,
        uploadId,
        partsCount: parts?.length,
      }, "Completing S3 multipart upload");
      
      await this.storage.completeMultipartUpload({
        key: track.objectKey,
        uploadId,
        parts: parts ?? []
      });
      
      this.logger.debug({
        event: "s3_multipart_completed",
        key: track.objectKey,
        uploadId,
      }, "S3 multipart upload completed");
      
      // Mark track as completed
      await this.trackRepository.markCompleted(track.id, parts ?? []);
      
      // Update session status to complete
      await this.sessionRepository.update(sessionId, { 
        status: SessionStatus.COMPLETE 
      });
      
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
    if (!session) throw new Error("Session not found");
    if (session.status !== SessionStatus.LIVE) {
      await this.sessionRepository.update(sessionId, { status: SessionStatus.LIVE });
    }
    return this.sessionRepository.findByIdWithTracks(sessionId);
  }

  async getDownloadUrl(sessionId: SessionId, trackId: string): Promise<string> {
    const track = await this.trackRepository.findById(trackId);
    if (!track) throw new Error("Track not found");
    if (track.sessionId !== sessionId) throw new Error("Track does not belong to session");
    if (!track.completedAt) throw new Error("Track not uploaded yet");
    return this.storage.getSignedDownloadUrl({ key: track.objectKey });
  }

  async getRecordingUrl(sessionId: SessionId): Promise<string> {
    const session = await this.sessionRepository.findByIdWithTracks(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    const latestCompletedRecording = [...session.tracks]
      .reverse()
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
}
