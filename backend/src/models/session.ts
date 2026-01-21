import {
  type Session,
  type SessionId,
  type Track,
  type TrackId,
  SessionStatus,
  TrackKind
} from "@podster/shared";

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
