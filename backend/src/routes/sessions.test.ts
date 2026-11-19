import assert from "node:assert/strict";
import type { OutgoingHttpHeaders } from "node:http";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import { SessionStatus } from "@prisma/client";
import { authPlugin } from "../plugins/auth.js";
import { getContainer, TOKENS } from "../container/container.js";
import type { ISessionService } from "../services/ISessionService.js";
import { createInMemorySessionService } from "../test-support/inMemorySessionService.js";
import sessionsRoutes from "./sessions.js";

async function createTestApp(t: TestContext, service: ISessionService) {
  getContainer().registerInstance(TOKENS.SessionService, service);

  const app = Fastify();
  t.after(async () => app.close());
  await app.register(fastifyCookie, {
    secret: "test-cookie-secret-that-is-at-least-32-characters"
  });
  await app.register(authPlugin);
  await app.register(sessionsRoutes);
  return app;
}

function getAuthCookie(headers: OutgoingHttpHeaders) {
  const setCookie = headers["set-cookie"];
  const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (typeof cookieHeader !== "string") {
    assert.fail("Expected an authentication cookie");
  }
  return cookieHeader.split(";")[0];
}

test("session HTTP lifecycle completes and then rejects further mutations", async (t) => {
  const app = await createTestApp(t, createInMemorySessionService());

  const createResponse = await app.inject({
    method: "POST",
    url: "/sessions",
    payload: { title: "Lifecycle episode" }
  });
  assert.equal(createResponse.statusCode, 201);
  const created = createResponse.json() as { session: { id: string; status: SessionStatus } };
  const sessionId = created.session.id;
  const hostCookie = getAuthCookie(createResponse.headers);
  assert.equal(created.session.status, SessionStatus.DRAFT);

  const joinResponse = await app.inject({
    method: "POST",
    url: `/sessions/${sessionId}/join`,
    payload: { guestName: "Guest" }
  });
  assert.equal(joinResponse.statusCode, 200);
  const guestCookie = getAuthCookie(joinResponse.headers);

  const startResponse = await app.inject({
    method: "POST",
    url: `/sessions/${sessionId}/start`,
    headers: { cookie: hostCookie }
  });
  assert.equal(startResponse.statusCode, 200);
  assert.equal(startResponse.json().status, SessionStatus.LIVE);

  const uploadResponse = await app.inject({
    method: "POST",
    url: `/sessions/${sessionId}/upload-urls`,
    headers: { cookie: guestCookie },
    payload: { partCount: 1 }
  });
  assert.equal(uploadResponse.statusCode, 200);
  const upload = uploadResponse.json() as { uploadId: string; urls: string[] };
  assert.equal(upload.uploadId, "upload-1");
  assert.deepEqual(upload.urls, ["https://storage.example/upload-1/part-1"]);

  const uploadingSessionResponse = await app.inject({
    method: "GET",
    url: `/sessions/${sessionId}`,
    headers: { cookie: guestCookie }
  });
  assert.equal(uploadingSessionResponse.statusCode, 200);
  assert.equal(uploadingSessionResponse.json().status, SessionStatus.UPLOADING);

  const completeResponse = await app.inject({
    method: "POST",
    url: `/sessions/${sessionId}/complete-upload`,
    headers: { cookie: guestCookie },
    payload: {
      uploadId: upload.uploadId,
      parts: [{ partNumber: 1, etag: "etag-1" }]
    }
  });
  assert.equal(completeResponse.statusCode, 200);
  assert.equal(completeResponse.json().status, SessionStatus.COMPLETE);

  const retryCompleteResponse = await app.inject({
    method: "POST",
    url: `/sessions/${sessionId}/complete-upload`,
    headers: { cookie: guestCookie },
    payload: {
      uploadId: upload.uploadId,
      parts: [{ partNumber: 1, etag: "etag-1" }]
    }
  });
  assert.equal(retryCompleteResponse.statusCode, 200);
  assert.equal(retryCompleteResponse.json().status, SessionStatus.COMPLETE);

  const [restartResponse, newUploadResponse, lateJoinResponse] = await Promise.all([
    app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/start`,
      headers: { cookie: hostCookie }
    }),
    app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/upload-urls`,
      headers: { cookie: guestCookie },
      payload: { partCount: 1 }
    }),
    app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/join`,
      payload: { guestName: "Late guest" }
    })
  ]);

  assert.equal(restartResponse.statusCode, 409);
  assert.equal(newUploadResponse.statusCode, 409);
  assert.equal(lateJoinResponse.statusCode, 409);
  assert.equal(lateJoinResponse.headers["set-cookie"], undefined);
});
