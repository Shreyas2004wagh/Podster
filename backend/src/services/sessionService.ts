import { SessionStore, type CreateSessionInput, SessionStatus, type SessionId, type Track, StorageProvider, TrackKind } from "../models/session.js";
import { S3StorageProvider } from "../storage/s3Storage.js";
import type { StorageProvider as IStorageProvider } from "../storage/storageProvider.js";

export class SessionService {
  private readonly store = new SessionStore();
  private readonly storage: IStorageProvider;

  constructor(storage: IStorageProvider = new S3StorageProvider()) {
    this.storage = storage;
  }

  createSession(input: CreateSessionInput) {
    return this.store.create(input);
  }

  getSession(sessionId: SessionId) {
    return this.store.get(sessionId);
  }

  async requestUploadUrls(sessionId: SessionId, partCount: number) {
    const session = this.store.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    const key = `sessions/${sessionId}/${Date.now()}.webm`;
    const { uploadId, urls } = await this.storage.createMultipartUpload({ key, partCount });

    if (session.status === SessionStatus.Draft) {
      session.status = SessionStatus.Uploading;
      session.uploadTarget = {
        uploadId,
        key,
        bucket: "podster",
        provider: StorageProvider.S3,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      };
    }

    const track: Track = this.store.addTrack({
      sessionId,
      userId: session.hostId,
      kind: TrackKind.Video,
      objectKey: key
    });

    return { uploadId, urls, trackId: track.id, objectKey: key };
  }

  async completeUpload(sessionId: SessionId, uploadId: string, parts: Track["parts"]) {
    console.log("completeUpload called", { sessionId, uploadId, partsCount: parts?.length, parts });
    const session = this.store.get(sessionId);
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
    console.log("S3 upload completed, marking session as uploaded");
    this.store.markUploaded(sessionId, track.id, parts ?? []);
    return this.store.get(sessionId);
  }
}
