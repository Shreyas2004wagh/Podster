import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient, SessionStatus, StorageProvider, TrackKind } from "@prisma/client";
import { SessionConflictError } from "../services/errors.js";
import { PrismaSessionRepository } from "./PrismaSessionRepository.js";

const databaseUrl = process.env.PODSTER_TEST_DATABASE_URL;

test("PostgreSQL keeps session closure and upload registration consistent", {
  skip: databaseUrl ? false : "Set PODSTER_TEST_DATABASE_URL to a migrated test database"
}, async () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const sessions = new PrismaSessionRepository(prisma);
  const hostId = `host-${randomUUID()}`;

  function registerUpload(sessionId: string, uploadId: string, userId: string, expiresAt = new Date(Date.now() + 60_000)) {
    const objectKey = `sessions/${sessionId}/${userId}/${uploadId}.webm`;
    return sessions.registerUpload(
      { sessionId, userId, uploadId, kind: TrackKind.VIDEO, objectKey },
      { sessionId, uploadId, key: objectKey, bucket: "test", provider: StorageProvider.S3, expiresAt, partCount: 1 }
    );
  }

  try {
    const { id } = await sessions.create({ title: "Session closure", hostId });
    const hostTrack = await registerUpload(id, randomUUID(), hostId);
    await prisma.track.update({ where: { id: hostTrack.id }, data: { completedAt: new Date() } });
    await prisma.uploadTarget.deleteMany({ where: { sessionId: id } });

    const [finish, guestUpload] = await Promise.allSettled([
      sessions.finish(id),
      registerUpload(id, randomUUID(), "guest")
    ]);
    const state = await sessions.findByIdWithAll(id);
    assert.ok(state);
    if (finish.status === "fulfilled") {
      assert.equal(state.status, SessionStatus.COMPLETE);
      assert.equal(state.tracks.length, 1);
      assert.equal(state.uploadTargets.length, 0);
      assert.equal(guestUpload.status, "rejected");
      assert.ok(guestUpload.reason instanceof SessionConflictError);
    } else {
      assert.ok(finish.reason instanceof SessionConflictError);
      assert.equal(guestUpload.status, "fulfilled");
      assert.equal(state.status, SessionStatus.UPLOADING);
      assert.equal(state.tracks.length, 2);
      assert.equal(state.uploadTargets.length, 1);
    }

    const retrySession = await sessions.create({ title: "Upload replacement", hostId });
    const stale = await registerUpload(retrySession.id, randomUUID(), "guest", new Date(0));
    const other = await registerUpload(retrySession.id, randomUUID(), "other-guest");
    const duplicates = await Promise.allSettled([
      registerUpload(retrySession.id, randomUUID(), "guest"),
      registerUpload(retrySession.id, randomUUID(), "guest")
    ]);
    assert.equal(duplicates.filter((result) => result.status === "fulfilled").length, 1);
    assert.ok(duplicates.find((result) => result.status === "rejected")?.reason instanceof SessionConflictError);
    const retried = await sessions.findByIdWithAll(retrySession.id);
    assert.equal(retried?.tracks.length, 2);
    assert.equal(retried?.uploadTargets.length, 2);
    assert.ok(retried?.tracks.some((track) => track.id === other.id));
    assert.ok(!retried?.tracks.some((track) => track.id === stale.id));

    const rollback = await sessions.create({ title: "Upload rollback", hostId });
    assert.ok(other.uploadId);
    await assert.rejects(registerUpload(rollback.id, other.uploadId, "guest"), { code: "P2002" });
    const afterRollback = await sessions.findByIdWithAll(rollback.id);
    assert.equal(afterRollback?.status, SessionStatus.DRAFT);
    assert.equal(afterRollback?.tracks.length, 0);
    assert.equal(afterRollback?.uploadTargets.length, 0);
  } finally {
    try {
      await prisma.session.deleteMany({ where: { hostId } });
    } finally {
      await prisma.$disconnect();
    }
  }
});
