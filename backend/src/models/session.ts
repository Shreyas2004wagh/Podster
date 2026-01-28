// Legacy types - these are now replaced by Prisma-generated types
// Keeping minimal exports for backward compatibility during migration

export type SessionId = string;
export type TrackId = string;
export type UserId = string;

// Note: These enums are now defined in Prisma schema
// Import from @prisma/client instead of using these local definitions
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

export enum SessionRole {
  Host = "host",
  Guest = "guest"
}

export enum StorageProvider {
  S3 = "s3",
  R2 = "r2",
  Local = "local"
}

// Legacy interfaces - now replaced by Prisma-generated types
export interface UploadedPart {
  partNumber: number;
  etag: string;
}

// Input types for backward compatibility
export interface CreateSessionInput {
  title: string;
  hostId: string;
}

export interface CreateTrackInput {
  sessionId: SessionId;
  userId: string;
  kind: TrackKind;
  objectKey: string;
}

// SessionStore class removed - now using repository pattern with database persistence
