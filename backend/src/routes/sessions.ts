import fp from "fastify-plugin";
import { z } from "zod";
import { SessionService } from "../services/sessionService.js";
import { SessionRole } from "../models/session.js";

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
  const service = new SessionService();

  fastify.post("/sessions", async (request, reply) => {
    const body = createSessionSchema.parse(request.body);
    const hostId = body.hostId ?? `host-${crypto.randomUUID()}`;
    const session = service.createSession({ title: body.title, hostId });
    const hostToken = fastify.issueHostToken({ hostId });
    const guestToken = fastify.issueGuestToken({ sessionId: session.id, guestName: "Guest" });
    reply.code(201).send({ session, hostToken, guestToken });
  });

  fastify.get("/sessions/:id", async (request, reply) => {
    const sessionId = (request.params as { id: string }).id;
    const session = service.getSession(sessionId);
    if (!session) {
      reply.code(404).send({ message: "Session not found" });
      return;
    }
    reply.send(session);
  });

  fastify.post("/sessions/:id/join", async (request, reply) => {
    const sessionId = (request.params as { id: string }).id;
    const body = z.object({ guestName: z.string().min(1) }).parse(request.body);
    const token = fastify.issueGuestToken({ sessionId, guestName: body.guestName });
    reply.send({ token });
  });

  fastify.post(
    "/sessions/:id/upload-urls",
    { preHandler: fastify.authenticateHost },
    async (request, reply) => {
      const sessionId = (request.params as { id: string }).id;
      const body = uploadUrlSchema.parse(request.body);
      const result = await service.requestUploadUrls(sessionId, body.partCount);
      reply.send(result);
    }
  );

  fastify.post(
    "/sessions/:id/complete-upload",
    { preHandler: fastify.authenticateHost },
    async (request, reply) => {
      const sessionId = (request.params as { id: string }).id;
      const body = completeUploadSchema.parse(request.body);
      const session = await service.completeUpload(sessionId, body.uploadId, body.parts);
      reply.send(session);
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
