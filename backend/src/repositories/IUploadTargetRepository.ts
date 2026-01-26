import { UploadTarget } from "@prisma/client";

// Type aliases
export type UploadTargetId = string;
export type SessionId = string;

// Input types for upload target operations
export interface CreateUploadTargetInput {
  sessionId: SessionId;
  uploadId: string;
  key: string;
  bucket: string;
  provider: UploadTarget['provider'];
  expiresAt: Date;
}

export interface UpdateUploadTargetInput {
  uploadId?: string;
  key?: string;
  bucket?: string;
  provider?: UploadTarget['provider'];
  expiresAt?: Date;
}

export interface UploadTargetFilter {
  sessionId?: SessionId;
  provider?: UploadTarget['provider'];
  expired?: boolean; // Filter by whether expiresAt is in the past
}

/**
 * Repository interface for UploadTarget-related database operations
 * Manages multipart upload targets for session media files
 */
export interface IUploadTargetRepository {
  // Basic CRUD operations
  create(input: CreateUploadTargetInput): Promise<UploadTarget>;
  findById(id: UploadTargetId): Promise<UploadTarget | null>;
  update(id: UploadTargetId, input: UpdateUploadTargetInput): Promise<UploadTarget>;
  delete(id: UploadTargetId): Promise<void>;
  
  // Query operations
  findBySessionId(sessionId: SessionId): Promise<UploadTarget[]>;
  findActiveBySessionId(sessionId: SessionId): Promise<UploadTarget | null>; // Most recent non-expired
  findByUploadId(uploadId: string): Promise<UploadTarget | null>;
  findByFilter(filter: UploadTargetFilter): Promise<UploadTarget[]>;
  
  // Expiration management
  findExpired(): Promise<UploadTarget[]>;
  deleteExpired(): Promise<number>; // Returns count of deleted targets
  isExpired(id: UploadTargetId): Promise<boolean>;
  
  // Utility operations
  exists(id: UploadTargetId): Promise<boolean>;
  count(filter?: UploadTargetFilter): Promise<number>;
  deleteBySessionId(sessionId: SessionId): Promise<number>; // Returns count of deleted targets
}