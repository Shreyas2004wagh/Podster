import { SessionStore, type CreateSessionInput } from "../models/session";
import { S3StorageProvider } from "../storage/s3Storage";
import type { StorageProvider } from "../storage/storageProvider";
import { SessionStatus, type SessionId, type Track } from "@podster/shared";

export class SessionService {
  private readonly store = new SessionStore();
  private readonly storage: StorageProvider;

  constructor(storage: StorageProvider = new S3StorageProvider()) {
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
        provider: "s3",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      };
    }

    const track: Track = this.store.addTrack({
      sessionId,
      userId: session.hostId,
      kind: "video",
      objectKey: key
    });

    return { uploadId, urls, trackId: track.id, objectKey: key };
  }

  async completeUpload(sessionId: SessionId, uploadId: string, parts: Track["parts"]) {
    const session = this.store.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    const track = session.tracks[0];
    if (!track) {
      throw new Error("Track missing for upload completion");
    }
    await this.storage.completeMultipartUpload({
      key: track.objectKey,
      uploadId,
      parts: parts ?? []
    });
    this.store.markUploaded(sessionId, track.id, parts ?? []);
    return this.store.get(sessionId);
  }
}
