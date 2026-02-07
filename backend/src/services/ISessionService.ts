import { Session } from "@prisma/client";
import { CreateSessionInput, SessionId } from "../repositories/index.js";

/**
 * Interface for session business logic operations
 * Provides abstraction for testing and different implementations
 */
export interface ISessionService {
  /**
   * Create a new recording session
   */
  createSession(input: CreateSessionInput): Promise<Session>;

  /**
   * Get session by ID with tracks
   */
  getSession(sessionId: SessionId): Promise<Session | null>;

  /**
   * Request upload URLs for multipart upload
   */
  requestUploadUrls(sessionId: SessionId, partCount: number): Promise<{
    uploadId: string;
    urls: string[];
    trackId: string;
    objectKey: string;
  }>;

  /**
   * Mark session as live
   */
  markLive(sessionId: SessionId): Promise<Session | null>;

  /**
   * Complete multipart upload and finalize session
   */
  completeUpload(sessionId: SessionId, uploadId: string, parts: any[]): Promise<Session | null>;

  /**
   * Request signed download URL for a track
   */
  getDownloadUrl(sessionId: SessionId, trackId: string): Promise<string>;

  /**
   * Request signed download URL for the latest completed session recording
   */
  getRecordingUrl(sessionId: SessionId): Promise<string>;
}
