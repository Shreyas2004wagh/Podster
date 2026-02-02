import fp from "fastify-plugin";

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
import { resolve, TOKENS } from "../container/container.js";

const createSessionSchema = z.object({
  title: z.string().min(1),
  hostId: z.string().optional()
});

const uploadUrlSchema = z.object({
  partCount: z.number().min(1)
});

const completeUploadSchema = z.object({
  uploadId: z.string(),
  parts: z
    .array(
      z.object({
        etag: z.string(),
        partNumber: z.number()
      })
    )
    .default([])
});

export default fp(async (fastify) => {
  // Resolve SessionService from the DI container
  const service = resolve<ISessionService>(TOKENS.SessionService);

  fastify.post("/sessions", async (request, reply) => {
    try {
      const body = createSessionSchema.parse(request.body);
      const hostId = body.hostId ?? `host-${crypto.randomUUID()}`;
      const session = await service.createSession({ title: body.title, hostId });
      const hostToken = fastify.issueHostToken({ hostId });
      const guestToken = fastify.issueGuestToken({ sessionId: session.id, guestName: "Guest" });
      reply.code(201).send({ session, hostToken, guestToken });
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
      const body = z.object({ guestName: z.string().min(1) }).parse(request.body);
      const token = fastify.issueGuestToken({ sessionId, guestName: body.guestName });
      reply.send({ token });
    } catch (err) {
      request.log.error({ err }, "Failed to join session");
      reply.code(400).send({ message: err instanceof Error ? err.message : "Invalid request" });
    }
  });

  fastify.post(
    "/sessions/:id/upload-urls",
    { preHandler: fastify.authenticateHost },
    async (request, reply) => {
      try {
        const sessionId = (request.params as { id: string }).id;
        const body = uploadUrlSchema.parse(request.body);
        const result = await service.requestUploadUrls(sessionId, body.partCount);
        reply.send(result);
      } catch (err) {
        request.log.error({ err }, "Failed to request upload URLs");
        reply.code(400).send({ message: err instanceof Error ? err.message : "Invalid request" });
      }
    }
  );

  fastify.post(
    "/sessions/:id/complete-upload",
    { preHandler: fastify.authenticateHost },
    async (request, reply) => {
      try {
        const sessionId = (request.params as { id: string }).id;
        const body = completeUploadSchema.parse(request.body);
        const session = await service.completeUpload(sessionId, body.uploadId, body.parts);
        reply.send(session);
      } catch (err) {
        request.log.error({ err }, "Failed to complete upload");
        reply.code(400).send({ message: err instanceof Error ? err.message : "Invalid request" });
      }
    }
  );

  fastify.addHook("preHandler", async (request, _reply) => {
    // Attach basic role info if token present; endpoint-level guards enforce specifics.
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      try {
        const decoded = (await (request as any).hostJwtVerify(token)) as { sub: string };
        request.user = { sub: decoded.sub, role: SessionRole.Host };
      } catch {
        // ignore; guest routes handled separately
      }
    }
  });
});
