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
          partCount: input.partCount,
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
  assert.equal(createdTargets[0]?.partCount, 2);
  assert.ok(createdTargets[0]!.expiresAt.getTime() - Date.now() >= 59 * 60 * 1000);
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
    /already in progress/
  );
  assert.equal(storageCalled, false);
});

test("requestUploadUrls clears stale incomplete uploads before creating a fresh target", async () => {
  const deletedTrackIds: string[] = [];
  const deletedTargetIds: string[] = [];

  const service = new SessionService(
    createSessionRepositoryMock({
      findById: async () => createSession()
    }),
    createTrackRepositoryMock({
      findIncompleteTracks: async () => [
        createTrack({
          id: "track-stale",
          userId: "guest-1",
          objectKey: "sessions/session-1/guest-1/track.webm"
        }),
        createTrack({
          id: "track-other",
          userId: "guest-2",
          objectKey: "sessions/session-1/guest-2/track.webm"
        })
      ],
      delete: async (id) => {
        deletedTrackIds.push(id);
      }
    }),
    createUploadTargetRepositoryMock({
      findBySessionId: async () => [
        createUploadTarget({
          id: "target-stale",
          key: "sessions/session-1/guest-1/track.webm",
          expiresAt: new Date("2026-03-17T03:00:00.000Z")
        }),
        createUploadTarget({
          id: "target-other",
          key: "sessions/session-1/guest-2/track.webm"
        })
      ],
      delete: async (id) => {
        deletedTargetIds.push(id);
      }
    }),
    createStorageProviderMock({
      createMultipartUpload: async () => ({
        uploadId: "upload-2",
        urls: ["https://example.test/part-1"]
      })
    })
  );

  const result = await service.requestUploadUrls("session-1", "guest-1", 1);

  assert.equal(result.uploadId, "upload-2");
  assert.deepEqual(deletedTrackIds, ["track-stale"]);
  assert.deepEqual(deletedTargetIds, ["target-stale"]);
});

test("requestUploadUrls rolls back storage and metadata when track creation fails", async () => {
  const updatedStatuses: SessionStatus[] = [];
  const deletedTargetIds: string[] = [];
  const abortedUploads: Array<{ key: string; uploadId: string }> = [];
  const originalDateNow = Date.now;
  Date.now = () => 1_710_000_000_000;

  try {
    const service = new SessionService(
      createSessionRepositoryMock({
        findById: async () => createSession({ status: SessionStatus.DRAFT }),
        update: async (_id, input) => {
          updatedStatuses.push(input.status ?? SessionStatus.DRAFT);
          return createSession({ status: input.status ?? SessionStatus.DRAFT });
        }
      }),
      createTrackRepositoryMock({
        create: async () => {
          throw new Error("track create failed");
        }
      }),
      createUploadTargetRepositoryMock({
        create: async (input) =>
          createUploadTarget({
            id: "target-created",
            sessionId: input.sessionId,
            uploadId: input.uploadId,
            key: input.key,
            bucket: input.bucket,
            provider: input.provider,
            partCount: input.partCount,
            expiresAt: input.expiresAt
          }),
        delete: async (id) => {
          deletedTargetIds.push(id);
        }
      }),
      createStorageProviderMock({
        createMultipartUpload: async () => ({
          uploadId: "upload-rollback",
          urls: ["https://example.test/part-1"]
        }),
        abortMultipartUpload: async (request) => {
          abortedUploads.push(request);
        }
      })
    );

    await assert.rejects(
      service.requestUploadUrls("session-1", "guest-1", 1),
      /track create failed/
    );

    assert.deepEqual(updatedStatuses, [SessionStatus.UPLOADING, SessionStatus.DRAFT]);
    assert.deepEqual(deletedTargetIds, ["target-created"]);
    assert.deepEqual(abortedUploads, [
      {
        key: "sessions/session-1/guest-1/1710000000000.webm",
        uploadId: "upload-rollback"
      }
    ]);
  } finally {
    Date.now = originalDateNow;
  }
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

test("completeUpload keeps session uploading when other tracks remain pending", async () => {
  const updatedStatuses: SessionStatus[] = [];

  const service = new SessionService(
    createSessionRepositoryMock({
      findByIdWithTracks: async () =>
        Object.assign(createSession({ status: SessionStatus.UPLOADING }), {
          tracks: [
            createTrack({ id: "track-1", userId: "guest-1" }),
            createTrack({ id: "track-2", userId: "guest-2", objectKey: "sessions/session-1/guest-2/track.webm" })
          ]
        }),
      update: async (_id, input) => {
        updatedStatuses.push(input.status ?? SessionStatus.DRAFT);
        return createSession({ status: input.status ?? SessionStatus.DRAFT });
      }
    }),
    createTrackRepositoryMock({
      findIncompleteTracks: async () => [createTrack({ id: "track-2", userId: "guest-2" })]
    }),
    createUploadTargetRepositoryMock({
      findByUploadId: async () => createUploadTarget({ partCount: 1 })
    }),
    createStorageProviderMock()
  );

  const result = await service.completeUpload(
    "session-1",
    "upload-1",
    [{ partNumber: 1, etag: "etag-1" }],
    "guest-1"
  );

  assert.equal(updatedStatuses.includes(SessionStatus.COMPLETE), false);
  assert.equal(updatedStatuses.includes(SessionStatus.UPLOADING), false);
  assert.equal(result?.status, SessionStatus.UPLOADING);
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
    /unique|contiguous|count/
  );
});
