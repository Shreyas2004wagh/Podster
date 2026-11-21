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
import { StorageObjectNotFoundError, StorageProviderError } from "../storage/errors.js";
import {
  DownloadUrlGenerationError,
  InvalidUploadPartsError,
  SessionNotFoundError,
  SessionConflictError,
  TrackNotFoundError,
  TrackStorageMissingError,
  TrackNotUploadedError,
  TrackSessionMismatchError,
  UploadOwnershipError,
  UploadTargetSessionMismatchError
} from "./errors.js";

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
    uploadId: null,
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
    partCount: 2,
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
    markLiveIfDraft: async () => undefined,
    registerUpload: async (track) => createTrack(track),
    finish: async () => ({ ...createSession({ status: SessionStatus.COMPLETE }), tracks: [] }),
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
    abortMultipartUpload: async () => undefined,
    completeMultipartUpload: async () => undefined,
    getSignedDownloadUrl: async () => "https://example.test/download",
    checkHealth: async () => ({
      provider: "s3",
      bucket: "podster",
      region: "auto"
    }),
    ...overrides
  };
}

test("requestUploadUrls registers the track and target together", async () => {
  let sessionRegistered = false;
  const service = new SessionService(
    createSessionRepositoryMock({
      findById: async () => createSession(),
      registerUpload: async (track, target) => {
        sessionRegistered = true;
        assert.equal(track.sessionId, "session-1");
        assert.equal(track.userId, "guest-1");
        assert.equal(track.uploadId, "upload-1");
        assert.equal(track.objectKey, target.key);
        assert.equal(target.sessionId, track.sessionId);
        assert.equal(target.uploadId, track.uploadId);
        assert.equal(target.partCount, 2);
        assert.ok(target.expiresAt.getTime() - Date.now() >= 59 * 60 * 1000);
        return createTrack(track);
      }
    }),
    createTrackRepositoryMock(),
    createUploadTargetRepositoryMock(),
    createStorageProviderMock()
  );

  const result = await service.requestUploadUrls("session-1", "guest-1", 2);

  assert.equal(sessionRegistered, true);
  assert.equal(result.uploadId, "upload-1");
  assert.deepEqual(result.urls, ["https://example.test/part-1", "https://example.test/part-2"]);
});

test("requestUploadUrls rejects completed sessions before creating upload state", async () => {
  let storageCalled = false;
  let sessionUpdated = false;

  const service = new SessionService(
    createSessionRepositoryMock({
      findById: async () => createSession({ status: SessionStatus.COMPLETE }),
      update: async () => {
        sessionUpdated = true;
        return createSession({ status: SessionStatus.UPLOADING });
      }
    }),
    createTrackRepositoryMock(),
    createUploadTargetRepositoryMock(),
    createStorageProviderMock({
      createMultipartUpload: async () => {
        storageCalled = true;
        return { uploadId: "upload-1", urls: ["https://example.test/part-1"] };
      }
    })
  );

  await assert.rejects(
    service.requestUploadUrls("session-1", "guest-1", 1),
    (error: unknown) =>
      error instanceof SessionConflictError && /completed/i.test(error.message)
  );
  assert.equal(storageCalled, false);
  assert.equal(sessionUpdated, false);
});

test("requestUploadUrls rejects duplicate active uploads for the same participant", async () => {
  let storageCalled = false;

  const service = new SessionService(
    createSessionRepositoryMock({
      findById: async () => createSession()
    }),
    createTrackRepositoryMock({
      findIncompleteTracks: async () => [createTrack({ userId: "guest-1" })]
    }),
    createUploadTargetRepositoryMock({
      findBySessionId: async () => [
        createUploadTarget({
          key: "sessions/session-1/guest-1/track.webm",
          expiresAt: new Date("2030-03-17T05:00:00.000Z")
        })
      ]
    }),
    createStorageProviderMock({
      createMultipartUpload: async () => {
        storageCalled = true;
        return {
          uploadId: "upload-2",
          urls: ["https://example.test/part-1"]
        };
      }
    })
  );

  await assert.rejects(
    service.requestUploadUrls("session-1", "guest-1", 1),
    (error: unknown) => error instanceof SessionConflictError && /already in progress/.test((error as Error).message)
  );
  assert.equal(storageCalled, false);
});

test("requestUploadUrls aborts the storage upload if registration loses a race with closure", async () => {
  const abortedUploads: Array<{ key: string; uploadId: string }> = [];
  const conflict = new SessionConflictError("Completed sessions cannot accept new uploads");
  const service = new SessionService(
    createSessionRepositoryMock({
      findById: async () => createSession(),
      registerUpload: async () => { throw conflict; }
    }),
    createTrackRepositoryMock(),
    createUploadTargetRepositoryMock(),
    createStorageProviderMock({
      abortMultipartUpload: async (request) => {
        abortedUploads.push(request);
      }
    })
  );

  await assert.rejects(
    service.requestUploadUrls("session-1", "guest-1", 2),
    (error) => error === conflict
  );
  assert.equal(abortedUploads.length, 1);
  assert.equal(abortedUploads[0]?.uploadId, "upload-1");
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
    (error: unknown) => error instanceof UploadOwnershipError && /authenticated user/.test((error as Error).message)
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
    (error: unknown) =>
      error instanceof UploadTargetSessionMismatchError &&
      /does not belong to session/.test((error as Error).message)
  );
});

test("completeUpload is idempotent when the track was already marked complete", async () => {
  const deletedTargetIds: string[] = [];
  let storageCompletionCalls = 0;

  const service = new SessionService(
    createSessionRepositoryMock({
      findByIdWithTracks: async () =>
        Object.assign(createSession({ status: SessionStatus.UPLOADING }), {
          tracks: [
            createTrack({
              id: "track-1",
              userId: "guest-1",
              completedAt: new Date("2026-03-17T04:10:00.000Z")
            })
          ]
        })
    }),
    createTrackRepositoryMock({
      findIncompleteTracks: async () => []
    }),
    createUploadTargetRepositoryMock({
      findByUploadId: async () => createUploadTarget({ partCount: 1 }),
      delete: async (id) => {
        deletedTargetIds.push(id);
      },
      findBySessionId: async () => []
    }),
    createStorageProviderMock({
      completeMultipartUpload: async () => {
        storageCompletionCalls += 1;
      }
    })
  );

  const result = await service.completeUpload(
    "session-1",
    "upload-1",
    [{ partNumber: 1, etag: "etag-1" }],
    "guest-1"
  );

  assert.equal(storageCompletionCalls, 0);
  assert.deepEqual(deletedTargetIds, ["target-1"]);
  assert.equal(result?.status, SessionStatus.UPLOADING);
  assert.equal(result?.tracks[0]?.completedAt?.toISOString(), "2026-03-17T04:10:00.000Z");
});

test("completeUpload is idempotent after upload target metadata is removed", async () => {
  let storageCompletionCalls = 0;

  const service = new SessionService(
    createSessionRepositoryMock({
      findByIdWithTracks: async () =>
        Object.assign(createSession({ status: SessionStatus.COMPLETE }), {
          tracks: [
            createTrack({
              userId: "guest-1",
              uploadId: "upload-1",
              completedAt: new Date("2026-03-17T04:10:00.000Z")
            })
          ]
        })
    }),
    createTrackRepositoryMock({
      findIncompleteTracks: async () => []
    }),
    createUploadTargetRepositoryMock({
      findByUploadId: async () => null,
      findBySessionId: async () => []
    }),
    createStorageProviderMock({
      completeMultipartUpload: async () => {
        storageCompletionCalls += 1;
      }
    })
  );

  const result = await service.completeUpload(
    "session-1",
    "upload-1",
    [{ partNumber: 1, etag: "etag-1" }],
    "guest-1"
  );

  assert.equal(storageCompletionCalls, 0);
  assert.equal(result?.status, SessionStatus.COMPLETE);
  assert.equal(result?.tracks[0]?.uploadId, "upload-1");
});

test("completeUpload rejects malformed multipart part lists", async () => {
  const service = new SessionService(
    createSessionRepositoryMock({
      findByIdWithTracks: async () =>
        Object.assign(createSession({ status: SessionStatus.UPLOADING }), {
          tracks: [createTrack({ userId: "guest-1" })]
        })
    }),
    createTrackRepositoryMock(),
    createUploadTargetRepositoryMock({
      findByUploadId: async () => createUploadTarget({ partCount: 2 })
    }),
    createStorageProviderMock()
  );

  await assert.rejects(
    service.completeUpload(
      "session-1",
      "upload-1",
      [
        { partNumber: 1, etag: "etag-1" },
        { partNumber: 1, etag: "etag-2" }
      ],
      "guest-1"
    ),
    (error: unknown) =>
      error instanceof InvalidUploadPartsError &&
      /unique|contiguous|count/.test((error as Error).message)
  );
});

test("markLive throws a typed not found error when the session is missing", async () => {
  const service = new SessionService(
    createSessionRepositoryMock({
      findById: async () => null
    }),
    createTrackRepositoryMock(),
    createUploadTargetRepositoryMock(),
    createStorageProviderMock()
  );

  await assert.rejects(
    service.markLive("session-missing"),
    (error: unknown) =>
      error instanceof SessionNotFoundError &&
      /session-missing/.test((error as Error).message)
  );
});

test("markLive rejects completed sessions", async () => {
  const service = new SessionService(
    createSessionRepositoryMock({
      findByIdWithTracks: async () => ({
        ...createSession({ status: SessionStatus.COMPLETE }),
        tracks: []
      })
    }),
    createTrackRepositoryMock(),
    createUploadTargetRepositoryMock(),
    createStorageProviderMock()
  );

  await assert.rejects(
    service.markLive("session-1"),
    (error: unknown) =>
      error instanceof SessionConflictError && /completed/i.test(error.message)
  );
});

test("getDownloadUrl throws a typed not found error when the track is missing", async () => {
  const service = new SessionService(
    createSessionRepositoryMock(),
    createTrackRepositoryMock({
      findById: async () => null
    }),
    createUploadTargetRepositoryMock(),
    createStorageProviderMock()
  );

  await assert.rejects(
    service.getDownloadUrl("session-1", "track-missing"),
    (error: unknown) =>
      error instanceof TrackNotFoundError &&
      /track-missing/.test((error as Error).message)
  );
});

test("getDownloadUrl throws a typed session mismatch error for tracks from another session", async () => {
  const service = new SessionService(
    createSessionRepositoryMock(),
    createTrackRepositoryMock({
      findById: async () => createTrack({ sessionId: "session-2", completedAt: new Date("2026-03-17T04:10:00.000Z") })
    }),
    createUploadTargetRepositoryMock(),
    createStorageProviderMock()
  );

  await assert.rejects(
    service.getDownloadUrl("session-1", "track-1"),
    (error: unknown) =>
      error instanceof TrackSessionMismatchError &&
      /session-1/.test((error as Error).message)
  );
});

test("getDownloadUrl throws a typed pending upload error for incomplete tracks", async () => {
  const service = new SessionService(
    createSessionRepositoryMock(),
    createTrackRepositoryMock({
      findById: async () => createTrack({ completedAt: null })
    }),
    createUploadTargetRepositoryMock(),
    createStorageProviderMock()
  );

  await assert.rejects(
    service.getDownloadUrl("session-1", "track-1"),
    (error: unknown) =>
      error instanceof TrackNotUploadedError &&
      /track-1/.test((error as Error).message)
  );
});

test("getDownloadUrl throws a typed storage-missing error when the uploaded object is gone", async () => {
  const service = new SessionService(
    createSessionRepositoryMock(),
    createTrackRepositoryMock({
      findById: async () =>
        createTrack({ completedAt: new Date("2026-03-17T04:10:00.000Z") })
    }),
    createUploadTargetRepositoryMock(),
    createStorageProviderMock({
      getSignedDownloadUrl: async () => {
        throw new StorageObjectNotFoundError("sessions/session-1/guest-1/track.webm");
      }
    })
  );

  await assert.rejects(
    service.getDownloadUrl("session-1", "track-1"),
    (error: unknown) =>
      error instanceof TrackStorageMissingError &&
      /track-1/.test((error as Error).message)
  );
});

test("getDownloadUrl throws a typed generation error when storage signing fails", async () => {
  const service = new SessionService(
    createSessionRepositoryMock(),
    createTrackRepositoryMock({
      findById: async () =>
        createTrack({ completedAt: new Date("2026-03-17T04:10:00.000Z") })
    }),
    createUploadTargetRepositoryMock(),
    createStorageProviderMock({
      getSignedDownloadUrl: async () => {
        throw new StorageProviderError("S3 signing failed");
      }
    })
  );

  await assert.rejects(
    service.getDownloadUrl("session-1", "track-1"),
    (error: unknown) =>
      error instanceof DownloadUrlGenerationError &&
      /track-1/.test((error as Error).message)
  );
});

test("getRecordingUrl picks the newest completed recording by completion time", async () => {
  const requestedKeys: string[] = [];
  const service = new SessionService(
    createSessionRepositoryMock({
      findByIdWithTracks: async () =>
        Object.assign(createSession(), {
          tracks: [
            createTrack({
              id: "track-newest",
              objectKey: "sessions/session-1/guest-1/newest.webm",
              createdAt: new Date("2026-03-17T04:02:00.000Z"),
              completedAt: new Date("2026-03-17T04:10:00.000Z")
            }),
            createTrack({
              id: "track-audio",
              kind: TrackKind.AUDIO,
              objectKey: "sessions/session-1/guest-1/audio.webm",
              createdAt: new Date("2026-03-17T04:03:00.000Z"),
              completedAt: new Date("2026-03-17T04:20:00.000Z")
            }),
            createTrack({
              id: "track-older",
              objectKey: "sessions/session-1/guest-1/older.webm",
              createdAt: new Date("2026-03-17T04:05:00.000Z"),
              completedAt: new Date("2026-03-17T04:06:00.000Z")
            })
          ]
        })
    }),
    createTrackRepositoryMock(),
    createUploadTargetRepositoryMock(),
    createStorageProviderMock({
      getSignedDownloadUrl: async ({ key }) => {
        requestedKeys.push(key);
        return `https://example.test/download?key=${encodeURIComponent(key)}`;
      }
    })
  );

  const url = await service.getRecordingUrl("session-1");

  assert.equal(requestedKeys[0], "sessions/session-1/guest-1/newest.webm");
  assert.match(url, /newest\.webm/);
});
