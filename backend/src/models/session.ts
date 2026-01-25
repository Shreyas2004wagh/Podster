// Define types locally until shared package build is fixed
export type SessionId = string;
export type TrackId = string;
export type UserId = string;

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

export interface UploadedPart {
  partNumber: number;
  etag: string;
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

export interface UploadTarget {
  uploadId: string;
  key: string;
  bucket: string;
  provider: StorageProvider;
  expiresAt: string;
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

export class SessionStore {
  private sessions = new Map<SessionId, Session>();

  create(input: CreateSessionInput): Session {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const session: Session = {
      id,
      title: input.title,
      status: SessionStatus.Draft,
      hostId: input.hostId,
      createdAt: now,
      updatedAt: now,
      tracks: []
    };
    this.sessions.set(id, session);
    return session;
  }

  get(sessionId: SessionId): Session | null {
    return this.sessions.get(sessionId) ?? null;
  }

  addTrack(input: CreateTrackInput): Track {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    const track: Track = {
      id: crypto.randomUUID() as TrackId,
      sessionId: input.sessionId,
      userId: input.userId,
      kind: input.kind,
      objectKey: input.objectKey,
      createdAt: new Date().toISOString(),
      parts: []
    };
    session.tracks.push(track);
    session.updatedAt = new Date().toISOString();
    this.sessions.set(session.id, session);
    return track;
  }

  markUploaded(sessionId: SessionId, trackId: TrackId, parts: Track["parts"]) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    const track = session.tracks.find((t) => t.id === trackId);
    if (!track) {
      throw new Error("Track not found");
    }
    track.parts = parts;
    track.completedAt = new Date().toISOString();
    session.status = SessionStatus.Complete;
    session.updatedAt = new Date().toISOString();
    this.sessions.set(session.id, session);
  }
}
