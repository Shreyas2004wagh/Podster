export type SessionId = string;
export type TrackId = string;
export type UserId = string;

export enum SessionRole {
  Host = "host",
  Guest = "guest"
}

export enum SessionStatus {
  Draft = "draft",
  Live = "live",
  Uploading = "uploading",
  Complete = "complete"
}

export enum TrackKind {
  Audio = "audio",
  Video = "video"
}

export enum StorageProvider {
  S3 = "s3",
  R2 = "r2",
  Local = "local"
}

export interface Track {
  id: TrackId;
  sessionId: SessionId;
  userId: UserId;
  kind: TrackKind;
  objectKey: string;
  createdAt: string;
  completedAt?: string;
  parts?: UploadedPart[];
}

export interface UploadedPart {
  partNumber: number;
  etag: string;
}

export interface Session {
  id: SessionId;
  title: string;
  status: SessionStatus;
  hostId: UserId;
  guestToken?: string;
  createdAt: string;
  updatedAt: string;
  tracks: Track[];
  uploadTarget?: UploadTarget;
}

export interface UploadTarget {
  uploadId: string;
  key: string;
  bucket: string;
  provider: StorageProvider;
  expiresAt: string;
}
