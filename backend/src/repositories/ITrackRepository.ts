import { Track } from "@prisma/client";

// Type aliases
export type TrackId = string;
export type SessionId = string;
export type UserId = string;

// Input types for track operations
export interface CreateTrackInput {
  sessionId: SessionId;
  userId: UserId;
  kind: Track['kind'];
  objectKey: string;
}

export interface UpdateTrackInput {
  objectKey?: string;
  completedAt?: Date;
  parts?: any; // JSONB type for upload parts
}

export interface TrackFilter {
  sessionId?: SessionId;
  userId?: UserId;
  kind?: Track['kind'];
  completed?: boolean; // Filter by whether completedAt is set
}

/**
 * Repository interface for Track-related database operations
 * Provides abstraction for track management within sessions
 */
export interface ITrackRepository {
  // Basic CRUD operations
  create(input: CreateTrackInput): Promise<Track>;
  findById(id: TrackId): Promise<Track | null>;
  update(id: TrackId, input: UpdateTrackInput): Promise<Track>;
  delete(id: TrackId): Promise<void>;
  
  // Query operations
  findBySessionId(sessionId: SessionId): Promise<Track[]>;
  findByUserId(userId: UserId): Promise<Track[]>;
  findByFilter(filter: TrackFilter): Promise<Track[]>;
  
  // Track completion operations
  markCompleted(id: TrackId, parts: any): Promise<Track>;
  findCompletedTracks(sessionId: SessionId): Promise<Track[]>;
  findIncompleteTracks(sessionId: SessionId): Promise<Track[]>;
  
  // Utility operations
  exists(id: TrackId): Promise<boolean>;
  count(filter?: TrackFilter): Promise<number>;
  deleteBySessionId(sessionId: SessionId): Promise<number>; // Returns count of deleted tracks
}