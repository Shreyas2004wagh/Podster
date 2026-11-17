import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import { SessionStatus, type Session } from "@prisma/client";
import { authPlugin } from "../plugins/auth.js";
import { getContainer, TOKENS } from "../container/container.js";
import type { ISessionService } from "../services/ISessionService.js";
import sessionsRoutes from "./sessions.js";

function createCompletedSession(): Session {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Completed episode",
    status: SessionStatus.COMPLETE,
    hostId: "host-1",
    guestToken: null,
    createdAt: new Date("2026-03-17T04:00:00.000Z"),
    updatedAt: new Date("2026-03-17T05:00:00.000Z")
  };
}

test("POST /sessions/:id/join rejects completed sessions", async (t) => {
  const completedSession = createCompletedSession();
  const service: ISessionService = {
    createSession: async () => completedSession,
    getSession: async () => completedSession,
    requestUploadUrls: async () => {
      throw new Error("Unexpected requestUploadUrls call");
    },
    markLive: async () => {
      throw new Error("Unexpected markLive call");
    },
    completeUpload: async () => {
      throw new Error("Unexpected completeUpload call");
    },
    getDownloadUrl: async () => {
      throw new Error("Unexpected getDownloadUrl call");
    },
    getRecordingUrl: async () => {
      throw new Error("Unexpected getRecordingUrl call");
    }
  };

  getContainer().registerInstance(TOKENS.SessionService, service);

  const app = Fastify();
  t.after(async () => app.close());
  await app.register(fastifyCookie, {
    secret: "test-cookie-secret-that-is-at-least-32-characters"
  });
  await app.register(authPlugin);
  await app.register(sessionsRoutes);

  const response = await app.inject({
    method: "POST",
    url: `/sessions/${completedSession.id}/join`,
    payload: { guestName: "Guest" }
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), { message: "Completed sessions cannot be joined" });
  assert.equal(response.headers["set-cookie"], undefined);
});
