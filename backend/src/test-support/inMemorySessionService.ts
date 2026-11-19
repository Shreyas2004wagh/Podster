import { randomUUID } from "node:crypto";
import {
  SessionStatus,
  type Session,
  type Track,
  type UploadTarget
} from "@prisma/client";
import type { ISessionRepository } from "../repositories/ISessionRepository.js";
import type { ITrackRepository } from "../repositories/ITrackRepository.js";
import type { IUploadTargetRepository } from "../repositories/IUploadTargetRepository.js";
import type { ISessionService } from "../services/ISessionService.js";
import { SessionService } from "../services/sessionService.js";
import type { IStorageProvider } from "../storage/storageProvider.js";

function createStrictAdapter<T extends object>(name: string, implementations: Partial<T>): T {
  return new Proxy(implementations as T, {
    get(target, property, receiver) {
      if (property in target || typeof property === "symbol") {
        return Reflect.get(target, property, receiver);
      }

      return () => Promise.reject(new Error(`Unexpected ${name}.${String(property)} call`));
    }
  });
}

export function createInMemorySessionService(): ISessionService {
  const sessions = new Map<string, Session>();
  const tracks = new Map<string, Track>();
  const uploadTargets = new Map<string, UploadTarget>();

  const findSessionWithTracks = (id: string) => {
    const session = sessions.get(id);
    if (!session) return null;
    return {
      ...session,
      tracks: [...tracks.values()].filter((track) => track.sessionId === id)
    };
  };

  const sessionRepository = createStrictAdapter<ISessionRepository>("sessionRepository", {
    create: async (input) => {
      const session: Session = {
        id: randomUUID(),
        title: input.title,
        status: SessionStatus.DRAFT,
        hostId: input.hostId,
        guestToken: input.guestToken ?? null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      sessions.set(session.id, session);
      return session;
    },
    findById: async (id) => sessions.get(id) ?? null,
    findByIdWithTracks: async (id) => findSessionWithTracks(id),
    update: async (id, input) => {
      const session = sessions.get(id);
      if (!session) throw new Error(`Missing session ${id}`);
      const updated = Object.assign(session, input, { updatedAt: new Date() });
      sessions.set(id, updated);
      return updated;
    }
  });

  const trackRepository = createStrictAdapter<ITrackRepository>("trackRepository", {
    create: async (input) => {
      const track: Track = {
        id: randomUUID(),
        sessionId: input.sessionId,
        userId: input.userId,
        uploadId: input.uploadId ?? null,
        kind: input.kind,
        objectKey: input.objectKey,
        createdAt: new Date(),
        completedAt: null,
        parts: []
      };
      tracks.set(track.id, track);
      return track;
    },
    markCompleted: async (id, parts) => {
      const track = tracks.get(id);
      if (!track) throw new Error(`Missing track ${id}`);
      track.completedAt = new Date();
      track.parts = parts as Track["parts"];
      return track;
    },
    findIncompleteTracks: async (sessionId) =>
      [...tracks.values()].filter(
        (track) => track.sessionId === sessionId && !track.completedAt
      )
  });

  const uploadTargetRepository = createStrictAdapter<IUploadTargetRepository>(
    "uploadTargetRepository",
    {
      create: async (input) => {
        const target: UploadTarget = { id: randomUUID(), createdAt: new Date(), ...input };
        uploadTargets.set(target.id, target);
        return target;
      },
      delete: async (id) => {
        uploadTargets.delete(id);
      },
      findBySessionId: async (sessionId) =>
        [...uploadTargets.values()].filter((target) => target.sessionId === sessionId),
      findByUploadId: async (uploadId) =>
        [...uploadTargets.values()].find((target) => target.uploadId === uploadId) ?? null
    }
  );

  let nextUploadNumber = 1;
  const storage = createStrictAdapter<IStorageProvider>("storage", {
    createMultipartUpload: async ({ partCount }) => {
      const uploadId = `upload-${nextUploadNumber++}`;
      return {
        uploadId,
        urls: Array.from(
          { length: partCount },
          (_, index) => `https://storage.example/${uploadId}/part-${index + 1}`
        )
      };
    },
    completeMultipartUpload: async () => undefined
  });

  return new SessionService(
    sessionRepository,
    trackRepository,
    uploadTargetRepository,
    storage
  );
}
