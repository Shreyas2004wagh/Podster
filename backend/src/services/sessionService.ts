import { SessionStatus, TrackKind, StorageProvider } from "@prisma/client";
import { S3StorageProvider } from "../storage/s3Storage.js";
import type { StorageProvider as IStorageProvider } from "../storage/storageProvider.js";
import { 
  ISessionRepository, 
  ITrackRepository, 
  IUploadTargetRepository,
  CreateSessionInput,
  CreateTrackInput,
  CreateUploadTargetInput,
  SessionId,
  TrackId
} from "../repositories/index.js";

export class SessionService {
  private readonly sessionRepository: ISessionRepository;
  private readonly trackRepository: ITrackRepository;
  private readonly uploadTargetRepository: IUploadTargetRepository;
  private readonly storage: IStorageProvider;

  constructor(
    sessionRepository: ISessionRepository,
    trackRepository: ITrackRepository,
    uploadTargetRepository: IUploadTargetRepository,
    storage: IStorageProvider = new S3StorageProvider()
  ) {
    this.sessionRepository = sessionRepository;
    this.trackRepository = trackRepository;
    this.uploadTargetRepository = uploadTargetRepository;
    this.storage = storage;
  }

  async createSession(input: CreateSessionInput) {
    return await this.sessionRepository.create(input);
  }

  async getSession(sessionId: SessionId) {
    return await this.sessionRepository.findByIdWithTracks(sessionId);
  }

  async requestUploadUrls(sessionId: SessionId, partCount: number) {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    const key = `sessions/${sessionId}/${Date.now()}.webm`;
    const { uploadId, urls } = await this.storage.createMultipartUpload({ key, partCount });

    // Update session status if it's still in draft
    if (session.status === SessionStatus.DRAFT) {
      await this.sessionRepository.update(sessionId, { 
        status: SessionStatus.UPLOADING 
      });
      
      // Create upload target
      const uploadTargetInput: CreateUploadTargetInput = {
        sessionId,
        uploadId,
        key,
        bucket: "podster",
        provider: StorageProvider.S3,
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

    return { uploadId, urls, trackId: track.id, objectKey: key };
  }

  async completeUpload(sessionId: SessionId, uploadId: string, parts: any[]) {
    console.log("completeUpload called", { sessionId, uploadId, partsCount: parts?.length, parts });
    
    const session = await this.sessionRepository.findByIdWithTracks(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    const track = session.tracks[0];
    if (!track) {
      throw new Error("Track missing for upload completion");
    }
    
    console.log("Completing S3 multipart upload", { 
      key: track.objectKey, 
      uploadId, 
      parts: parts?.sort((a, b) => a.partNumber - b.partNumber) 
    });
    
    await this.storage.completeMultipartUpload({
      key: track.objectKey,
      uploadId,
      parts: parts ?? []
    });
    
    console.log("S3 upload completed, marking track as completed");
    
    // Mark track as completed
    await this.trackRepository.markCompleted(track.id, parts ?? []);
    
    // Update session status to complete
    await this.sessionRepository.update(sessionId, { 
      status: SessionStatus.COMPLETE 
    });
    
    return await this.sessionRepository.findByIdWithTracks(sessionId);
  }
}
