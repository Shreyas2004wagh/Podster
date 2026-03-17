import test from "node:test";
import assert from "node:assert/strict";
import {
  SessionStatus,
  StorageProvider,
  TrackKind,
  type Session,
  type Track,
  type UploadTarget
} from "@prisma/client";
import { SessionService } from "./sessionService.js";
import type { ISessionRepository } from "../repositories/ISessionRepository.js";
import type { ITrackRepository } from "../repositories/ITrackRepository.js";
import type { IUploadTargetRepository } from "../repositories/IUploadTargetRepository.js";
import type { IStorageProvider } from "../storage/storageProvider.js";

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    title: "Episode",
    status: SessionStatus.DRAFT,
    hostId: "host-1",
    guestToken: null,
    createdAt: new Date("2026-03-17T04:00:00.000Z"),
    updatedAt: new Date("2026-03-17T04:00:00.000Z"),
    ...overrides
  };
}

function createTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: "track-1",
    sessionId: "session-1",
    userId: "guest-1",
    kind: TrackKind.VIDEO,
    objectKey: "sessions/session-1/guest-1/track.webm",
    createdAt: new Date("2026-03-17T04:00:00.000Z"),
    completedAt: null,
    parts: [],
    ...overrides
  };
}

function createUploadTarget(overrides: Partial<UploadTarget> = {}): UploadTarget {
  return {
    id: "target-1",
    sessionId: "session-1",
    uploadId: "upload-1",
    key: "sessions/session-1/guest-1/track.webm",
    bucket: "podster",
    provider: StorageProvider.S3,
    expiresAt: new Date("2030-03-17T05:00:00.000Z"),
    createdAt: new Date("2026-03-17T04:00:00.000Z"),
    ...overrides
  };
}

function createSessionRepositoryMock(
  overrides: Partial<ISessionRepository> = {}
): ISessionRepository {
  return {
    create: async () => createSession(),
    findById: async () => null,
    findByIdWithTracks: async () => null,
    findByIdWithAll: async () => null,
    findByHostId: async () => [],
    update: async (_id, input) => createSession({ status: input.status }),
    delete: async () => undefined,
    addTrack: async () => createTrack(),
    findTrackById: async () => null,
    updateTrack: async () => createTrack(),
    deleteTrack: async () => undefined,
    findTracksBySessionId: async () => [],
    createUploadTarget: async () => createUploadTarget(),
    findUploadTargetBySessionId: async () => null,
    deleteUploadTarget: async () => undefined,
    exists: async () => true,
    count: async () => 0,
    findAll: async () => [],
    ...overrides
  };
}

function createTrackRepositoryMock(overrides: Partial<ITrackRepository> = {}): ITrackRepository {
  return {
    create: async () => createTrack(),
    findById: async () => null,
    update: async () => createTrack(),
    delete: async () => undefined,
    findBySessionId: async () => [],
    findByUserId: async () => [],
    findByFilter: async () => [],
    markCompleted: async () => createTrack({ completedAt: new Date("2026-03-17T04:10:00.000Z") }),
    findCompletedTracks: async () => [],
    findIncompleteTracks: async () => [],
    exists: async () => true,
    count: async () => 0,
    deleteBySessionId: async () => 0,
    ...overrides
  };
}

function createUploadTargetRepositoryMock(
  overrides: Partial<IUploadTargetRepository> = {}
): IUploadTargetRepository {
  return {
    create: async () => createUploadTarget(),
    findById: async () => null,
    update: async () => createUploadTarget(),
    delete: async () => undefined,
    findBySessionId: async () => [],
    findActiveBySessionId: async () => null,
    findByUploadId: async () => null,
    findByFilter: async () => [],
    findExpired: async () => [],
    deleteExpired: async () => 0,
    isExpired: async () => false,
    exists: async () => true,
    count: async () => 0,
    deleteBySessionId: async () => 0,
    ...overrides
  };
}

function createStorageProviderMock(overrides: Partial<IStorageProvider> = {}): IStorageProvider {
  return {
    createMultipartUpload: async () => ({
      uploadId: "upload-1",
      urls: ["https://example.test/part-1", "https://example.test/part-2"]
    }),
    completeMultipartUpload: async () => undefined,
    getSignedDownloadUrl: async () => "https://example.test/download",
    ...overrides
  };
}

test("requestUploadUrls marks the session as uploading and persists upload metadata", async () => {
  const updates: SessionStatus[] = [];
  const createdTargets: UploadTarget[] = [];
  const createdTracks: Track[] = [];

  const sessionRepository = createSessionRepositoryMock({
    findById: async () => createSession(),
    update: async (_id, input) => {
      updates.push(input.status ?? SessionStatus.DRAFT);
      return createSession({ status: input.status ?? SessionStatus.DRAFT });
    }
  });
  const trackRepository = createTrackRepositoryMock({
    create: async (input) => {
      const track = createTrack({ sessionId: input.sessionId, userId: input.userId, objectKey: input.objectKey });
      createdTracks.push(track);
      return track;
    }
  });
  const uploadTargetRepository = createUploadTargetRepositoryMock({
    create: async (input) => {
      const target = createUploadTarget({
        sessionId: input.sessionId,
        uploadId: input.uploadId,
        key: input.key,
        bucket: input.bucket,
        provider: input.provider,
        expiresAt: input.expiresAt
      });
      createdTargets.push(target);
      return target;
    }
  });

  const service = new SessionService(
    sessionRepository,
    trackRepository,
    uploadTargetRepository,
    createStorageProviderMock()
  );

  const result = await service.requestUploadUrls("session-1", "guest-1", 2);

  assert.equal(result.uploadId, "upload-1");
  assert.deepEqual(result.urls, ["https://example.test/part-1", "https://example.test/part-2"]);
  assert.deepEqual(updates, [SessionStatus.UPLOADING]);
  assert.equal(createdTargets.length, 1);
  assert.equal(createdTargets[0]?.sessionId, "session-1");
  assert.equal(createdTracks.length, 1);
  assert.equal(createdTracks[0]?.userId, "guest-1");
});

test("completeUpload rejects uploads that do not belong to the authenticated user", async () => {
  let storageCompleted = false;

  const service = new SessionService(
    createSessionRepositoryMock({
      findByIdWithTracks: async () =>
        Object.assign(createSession(), {
          tracks: [createTrack({ userId: "guest-1" })]
        })
    }),
    createTrackRepositoryMock(),
    createUploadTargetRepositoryMock({
      findByUploadId: async () => createUploadTarget()
    }),
    createStorageProviderMock({
      completeMultipartUpload: async () => {
        storageCompleted = true;
      }
    })
  );

  await assert.rejects(
    service.completeUpload("session-1", "upload-1", [{ partNumber: 1, etag: "etag-1" }], "guest-2"),
    /authenticated user/
  );
  assert.equal(storageCompleted, false);
});

test("completeUpload rejects upload targets from a different session", async () => {
  const service = new SessionService(
    createSessionRepositoryMock({
      findByIdWithTracks: async () =>
        Object.assign(createSession(), {
          tracks: [createTrack({ userId: "guest-1" })]
        })
    }),
    createTrackRepositoryMock(),
    createUploadTargetRepositoryMock({
      findByUploadId: async () => createUploadTarget({ sessionId: "session-2" })
    }),
    createStorageProviderMock()
  );

  await assert.rejects(
    service.completeUpload("session-1", "upload-1", [{ partNumber: 1, etag: "etag-1" }], "guest-1"),
    /does not belong to session/
  );
});
