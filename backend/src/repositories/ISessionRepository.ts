import { Session, Track, UploadTarget } from "@prisma/client";

// Type aliases for better readability
export type SessionId = string;
export type TrackId = string;
export type UserId = string;

// Input types for repository operations
export interface CreateSessionInput {
  title: string;
  hostId: string;
  guestToken?: string;
}

export interface UpdateSessionInput {
  title?: string;
  status?: Session['status'];
  guestToken?: string;
}

export interface CreateTrackInput {
  sessionId: SessionId;
  userId: UserId;
  kind: Track['kind'];
  objectKey: string;
}

export interface UpdateTrackInput {
  completedAt?: Date;
  parts?: any; // JSONB type
}

export interface CreateUploadTargetInput {
  sessionId: SessionId;
  uploadId: string;
  key: string;
  bucket: string;
  provider: UploadTarget['provider'];
  expiresAt: Date;
}

// Extended types with relations
export interface SessionWithTracks extends Session {
  tracks: Track[];
}

export interface SessionWithAll extends Session {
  tracks: Track[];
  uploadTargets: UploadTarget[];
}

/**
 * Repository interface for Session-related database operations
 * Provides abstraction layer between business logic and data persistence
 */
export interface ISessionRepository {
  // Session CRUD operations
  create(input: CreateSessionInput): Promise<Session>;
  findById(id: SessionId): Promise<Session | null>;
  findByIdWithTracks(id: SessionId): Promise<SessionWithTracks | null>;
  findByIdWithAll(id: SessionId): Promise<SessionWithAll | null>;
  findByHostId(hostId: UserId): Promise<Session[]>;
  update(id: SessionId, input: UpdateSessionInput): Promise<Session>;
  delete(id: SessionId): Promise<void>;
  
  // Track operations within sessions
  addTrack(input: CreateTrackInput): Promise<Track>;
  findTrackById(trackId: TrackId): Promise<Track | null>;
  updateTrack(trackId: TrackId, input: UpdateTrackInput): Promise<Track>;
  deleteTrack(trackId: TrackId): Promise<void>;
  findTracksBySessionId(sessionId: SessionId): Promise<Track[]>;
  
  // Upload target operations
  createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget>;
  findUploadTargetBySessionId(sessionId: SessionId): Promise<UploadTarget | null>;
  deleteUploadTarget(id: string): Promise<void>;
  
  // Utility operations
  exists(id: SessionId): Promise<boolean>;
  count(): Promise<number>;
  findAll(limit?: number, offset?: number): Promise<Session[]>;
}