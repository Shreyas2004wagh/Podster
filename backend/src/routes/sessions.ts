import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * @openapi
 * /sessions:
 *   post:
 *     summary: Create a new session
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSession'
 *     responses:
 *       201:
 *         description: Session created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 session:
 *                   $ref: '#/components/schemas/Session'
 *                 hostToken:
 *                   type: string
 *                 guestToken:
 *                   type: string
 *
 * /sessions/{id}:
 *   get:
 *     summary: Get session by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Session'
 *       404:
 *         description: Session not found
 *
 * /sessions/{id}/join:
 *   post:
 *     summary: Join a session as guest
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               guestName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Guest token issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *
 * /sessions/{id}/upload-urls:
 *   post:
 *     summary: Request upload URLs for session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UploadUrlRequest'
 *     responses:
 *       200:
 *         description: Upload URLs returned
 *
 * /sessions/{id}/complete-upload:
 *   post:
 *     summary: Complete upload for session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CompleteUploadRequest'
 *     responses:
 *       200:
 *         description: Upload completed
 *
 * components:
 *   schemas:
 *     CreateSession:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *         hostId:
 *           type: string
 *     Session:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         title:
 *           type: string
 *         hostId:
 *           type: string
 *     UploadUrlRequest:
 *       type: object
 *       properties:
 *         partCount:
 *           type: integer
 *     CompleteUploadRequest:
 *       type: object
 *       properties:
 *         uploadId:
 *           type: string
 *         parts:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               etag:
 *                 type: string
 *               partNumber:
 *                 type: integer
 */
import { z } from "zod";
import { ISessionService } from "../services/ISessionService.js";
import { SessionRole } from "../models/session.js";
import { env } from "../config/env.js";
import { resolve, TOKENS } from "../container/container.js";
import {
  RecordingNotFoundError,
  RecordingUrlGenerationError,
  SessionNotFoundError
} from "../services/errors.js";

const createSessionSchema = z.object({
  title: z.string().min(1),
  hostId: z.string().optional()
});

const uploadUrlSchema = z.object({
  partCount: z.number().int().min(1).max(10_000)
});

const completeUploadSchema = z.object({
  uploadId: z.string(),
  parts: z
    .array(
      z.object({
        etag: z.string().trim().min(1),
        partNumber: z.number().int().min(1)
      })
    )
    .default([])
});

type TokenPayload = {
  sub: string;
  role: SessionRole;
};

type AuthenticatedUser = {
  sub: string;
  role: SessionRole;
  sessionId?: string;
  name?: string;
};

type SessionParams = {
  id: string;
};

export default fp(async (fastify) => {
  // Resolve SessionService from the DI container
  const service = resolve<ISessionService>(TOKENS.SessionService);
  const TOKEN_COOKIE = "podster_token";

  const setAuthCookie = (reply: FastifyReply, token: string) => {
    reply.setCookie(TOKEN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/"
    });
  };

  fastify.post("/sessions", async (request, reply) => {
    try {
      const body = createSessionSchema.parse(request.body);
      const hostId = body.hostId ?? `host-${crypto.randomUUID()}`;
      const guestId = `guest-${crypto.randomUUID()}`;
      const session = await service.createSession({ title: body.title, hostId });
      const hostToken = fastify.issueHostToken({ hostId });
      const guestToken = fastify.issueGuestToken({ guestId, sessionId: session.id, guestName: "Guest" });
      setAuthCookie(reply, hostToken);
      reply.code(201).send({
        session,
        hostToken,
        guestToken,
        viewer: {
          userId: hostId,
          role: SessionRole.Host,
          name: hostId,
          sessionId: session.id
        }
      });
    } catch (err) {
      request.log.error({ err }, "Failed to create session");
      reply.code(400).send({ message: err instanceof Error ? err.message : "Invalid request" });
    }
  });

  fastify.get("/sessions/:id", async (request, reply) => {
    try {
      const sessionId = (request.params as { id: string }).id;
      const session = await service.getSession(sessionId);
      if (!session) {
        reply.code(404).send({ message: "Session not found" });
        return;
      }
      reply.send(session);
    } catch (err) {
      request.log.error({ err }, "Failed to get session");
      reply.code(500).send({ message: "Internal server error" });
    }
  });

  fastify.post("/sessions/:id/join", async (request, reply) => {
    try {
      const sessionId = (request.params as { id: string }).id;
      const session = await service.getSession(sessionId);
      if (!session) {
        reply.code(404).send({ message: "Session not found" });
        return;
      }
      const body = z.object({ guestName: z.string().min(1) }).parse(request.body);
      const guestId = `guest-${crypto.randomUUID()}`;
      const token = fastify.issueGuestToken({ guestId, sessionId, guestName: body.guestName });
      setAuthCookie(reply, token);
      reply.send({
        token,
        viewer: {
          userId: guestId,
          role: SessionRole.Guest,
          name: body.guestName,
          sessionId
        }
      });
    } catch (err) {
      request.log.error({ err }, "Failed to join session");
      reply.code(400).send({ message: err instanceof Error ? err.message : "Invalid request" });
    }
  });

  fastify.post(
    "/sessions/:id/start",
    { preHandler: fastify.authenticateAny },
    async (request, reply) => {
      try {
        const sessionId = (request.params as { id: string }).id;
        const session = await service.getSession(sessionId);
        if (!session) {
          reply.code(404).send({ message: "Session not found" });
          return;
        }
        const user = request.user as AuthenticatedUser | undefined;
        if (user?.role === SessionRole.Host && user.sub !== session.hostId) {
          reply.code(403).send({ message: "Forbidden" });
          return;
        }
        if (user?.role === SessionRole.Guest && user.sessionId !== sessionId) {
          reply.code(403).send({ message: "Forbidden" });
          return;
        }
        const updated = await service.markLive(sessionId);
        reply.send(updated);
      } catch (err) {
        request.log.error({ err }, "Failed to mark session live");
        reply.code(400).send({ message: err instanceof Error ? err.message : "Invalid request" });
      }
    }
  );

  fastify.post(
    "/sessions/:id/upload-urls",
    { preHandler: fastify.authenticateAny },
    async (request, reply) => {
      try {
        const sessionId = (request.params as { id: string }).id;
        const session = await service.getSession(sessionId);
        if (!session) {
          reply.code(404).send({ message: "Session not found" });
          return;
        }
        const user = request.user as AuthenticatedUser | undefined;
        if (!user) {
          reply.code(401).send({ message: "Authentication required" });
          return;
        }
        if (user.role === SessionRole.Host && user.sub !== session.hostId) {
          reply.code(403).send({ message: "Forbidden" });
          return;
        }
        if (user.role === SessionRole.Guest && user.sessionId !== sessionId) {
          reply.code(403).send({ message: "Forbidden" });
          return;
        }
        const body = uploadUrlSchema.parse(request.body);
        const result = await service.requestUploadUrls(sessionId, user.sub, body.partCount);
        reply.send(result);
      } catch (err) {
        request.log.error({ err }, "Failed to request upload URLs");
        reply.code(400).send({ message: err instanceof Error ? err.message : "Invalid request" });
      }
    }
  );

  fastify.post(
    "/sessions/:id/complete-upload",
    { preHandler: fastify.authenticateAny },
    async (request, reply) => {
      try {
        const sessionId = (request.params as { id: string }).id;
        const existingSession = await service.getSession(sessionId);
        if (!existingSession) {
          reply.code(404).send({ message: "Session not found" });
          return;
        }
        const user = request.user as AuthenticatedUser | undefined;
        if (!user) {
          reply.code(401).send({ message: "Authentication required" });
          return;
        }
        if (user.role === SessionRole.Host && user.sub !== existingSession.hostId) {
          reply.code(403).send({ message: "Forbidden" });
          return;
        }
        if (user.role === SessionRole.Guest && user.sessionId !== sessionId) {
          reply.code(403).send({ message: "Forbidden" });
          return;
        }
        const body = completeUploadSchema.parse(request.body);
        const updatedSession = await service.completeUpload(sessionId, body.uploadId, body.parts, user.sub);
        reply.send(updatedSession);
      } catch (err) {
        request.log.error({ err }, "Failed to complete upload");
        reply.code(400).send({ message: err instanceof Error ? err.message : "Invalid request" });
      }
    }
  );

  fastify.get(
    "/sessions/:id/tracks/:trackId/download",
    { preHandler: fastify.authenticateAny },
    async (request, reply) => {
      try {
        const params = request.params as { id: string; trackId: string };
        const session = await service.getSession(params.id);
        if (!session) {
          reply.code(404).send({ message: "Session not found" });
          return;
        }
        const user = request.user as AuthenticatedUser | undefined;
        if (user?.role === SessionRole.Guest && user.sessionId !== params.id) {
          reply.code(403).send({ message: "Forbidden" });
          return;
        }
        if (user?.role === SessionRole.Host && user.sub !== session.hostId) {
          reply.code(403).send({ message: "Forbidden" });
          return;
        }
        const url = await service.getDownloadUrl(params.id, params.trackId);
        reply.send({ url });
      } catch (err) {
        request.log.error({ err }, "Failed to get download URL");
        reply.code(400).send({ message: err instanceof Error ? err.message : "Invalid request" });
      }
    }
  );

  const getRecordingHandler = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const sessionId = (request.params as SessionParams).id;

    try {
      const session = await service.getSession(sessionId);
      if (!session) {
        reply.code(404).send({ message: "Session not found" });
        return;
      }

      const user = request.user as AuthenticatedUser | undefined;
      if (!user) {
        reply.code(401).send({ message: "Authentication required" });
        return;
      }
      if (user.role === SessionRole.Host && user.sub !== session.hostId) {
        reply.code(403).send({ message: "Forbidden" });
        return;
      }
      if (user.role === SessionRole.Guest && user.sessionId !== sessionId) {
        reply.code(403).send({ message: "Forbidden" });
        return;
      }

      const url = await service.getRecordingUrl(sessionId);
      reply.send({ url });
    } catch (err) {
      if (err instanceof SessionNotFoundError || err instanceof RecordingNotFoundError) {
        reply.code(404).send({ message: err.message });
        return;
      }
      if (err instanceof RecordingUrlGenerationError) {
        request.log.error({ err, sessionId }, "Storage error while generating recording URL");
        reply.code(502).send({ message: "Failed to generate recording URL" });
        return;
      }

      request.log.error({ err, sessionId }, "Failed to get recording URL");
      reply.code(500).send({ message: "Internal server error" });
    }
  };

  fastify.get("/sessions/:id/recording", { preHandler: fastify.authenticateAny }, getRecordingHandler);
  fastify.get("/api/sessions/:id/recording", { preHandler: fastify.authenticateAny }, getRecordingHandler);

  fastify.addHook("preHandler", async (request, reply) => {
    void reply;
    // Attach basic role info if token present; endpoint-level guards enforce specifics.
    const authHeader = request.headers.authorization;
    const token =
      authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : request.cookies?.podster_token;
    if (!token) return;
    try {
      const decoded = fastify.jwt.verify<TokenPayload>(token, {
        key: env.HOST_JWT_SECRET
      });
      if (decoded.role === SessionRole.Host) {
        request.user = { sub: decoded.sub, role: SessionRole.Host };
      }
    } catch {
      // ignore; endpoint-level guards handle auth
    }
  });
});
