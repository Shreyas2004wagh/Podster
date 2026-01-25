import fp from "fastify-plugin";
// @ts-ignore - TypeScript types for @fastify/jwt are not working properly
import fastifyJwt from "@fastify/jwt";
import { env } from "../config/env.js";
import { SessionRole } from "../models/session.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticateHost: any;
    authenticateGuest: any;
    issueHostToken: (payload: { hostId: string }) => string;
    issueGuestToken: (payload: { sessionId: string; guestName: string }) => string;
  }
}

export const authPlugin = fp(async (fastify) => {
  fastify.register(fastifyJwt, {
    secret: env.HOST_JWT_SECRET
  });

  // @ts-ignore
  fastify.decorate("issueHostToken", (payload: { hostId: string }) =>
    // @ts-ignore
    fastify.jwt.sign({ sub: payload.hostId, role: SessionRole.Host })
  );

  // @ts-ignore
  fastify.decorate("issueGuestToken", (payload: { sessionId: string; guestName: string }) =>
    // @ts-ignore
    fastify.jwt.sign(
      {
        sub: payload.sessionId,
        role: SessionRole.Guest,
        name: payload.guestName
      }
    )
  );

  // @ts-ignore
  fastify.decorate(
    "authenticateHost",
    async (request: any, reply: any) => {
      try {
        // @ts-ignore
        const decoded = await request.jwtVerify();
        request.user = { sub: decoded.sub, role: SessionRole.Host };
      } catch (err) {
        reply.code(401).send({ message: "Host authentication failed", error: String(err) });
      }
    }
  );

  // @ts-ignore
  fastify.decorate(
    "authenticateGuest",
    async (request: any, reply: any) => {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) throw new Error("Guest token missing");
        authHeader.replace("Bearer ", "");
        // @ts-ignore
        const decoded = await request.jwtVerify();
        request.user = { sub: decoded.sub as string, role: SessionRole.Guest };
      } catch (err) {
        reply.code(401).send({ message: "Guest authentication failed", error: String(err) });
      }
    }
  );
});
