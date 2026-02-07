import fp from "fastify-plugin";
// @ts-ignore - TypeScript types for @fastify/jwt are not working properly
import fastifyJwt from "@fastify/jwt";
import { env } from "../config/env.js";
import { SessionRole } from "../models/session.js";

type TokenPayload = {
  sub: string;
  role: SessionRole;
  name?: string;
};

declare module "fastify" {
  interface FastifyInstance {
    authenticateHost: any;
    authenticateGuest: any;
    authenticateAny: any;
    issueHostToken: (payload: { hostId: string }) => string;
    issueGuestToken: (payload: { sessionId: string; guestName: string }) => string;
  }
}

export const authPlugin = fp(async (fastify) => {
  const TOKEN_COOKIE = "podster_token";

  fastify.register(fastifyJwt, {
    secret: env.HOST_JWT_SECRET
  });

  // @ts-ignore
  fastify.decorate("issueHostToken", (payload: { hostId: string }) =>
    // @ts-ignore
    (fastify.jwt as any).sign({ sub: payload.hostId, role: SessionRole.Host })
  );

  // @ts-ignore
  fastify.decorate("issueGuestToken", (payload: { sessionId: string; guestName: string }) =>
    // @ts-ignore
    (fastify.jwt as any).sign(
      {
        sub: payload.sessionId,
        role: SessionRole.Guest,
        name: payload.guestName
      },
      { secret: env.GUEST_JWT_SECRET }
    )
  );

  const extractToken = (request: any) => {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) return authHeader.replace("Bearer ", "");
    return request.cookies?.[TOKEN_COOKIE] ?? null;
  };

  // @ts-ignore
  fastify.decorate(
    "authenticateHost",
    async (request: any, reply: any) => {
      try {
        const token = extractToken(request);
        if (!token) throw new Error("Host token missing");
        // @ts-ignore
        const decoded = (await (fastify.jwt as any).verify(token, {
          secret: env.HOST_JWT_SECRET
        })) as TokenPayload;
        if (decoded.role !== SessionRole.Host) {
          throw new Error("Host token required");
        }
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
        const token = extractToken(request);
        if (!token) throw new Error("Guest token missing");
        // @ts-ignore
        const decoded = (await (fastify.jwt as any).verify(token, {
          secret: env.GUEST_JWT_SECRET
        })) as TokenPayload;
        if (decoded.role !== SessionRole.Guest) {
          throw new Error("Guest token required");
        }
        request.user = { sub: decoded.sub, role: SessionRole.Guest };
      } catch (err) {
        reply.code(401).send({ message: "Guest authentication failed", error: String(err) });
      }
    }
  );

  // @ts-ignore
  fastify.decorate(
    "authenticateAny",
    async (request: any, reply: any) => {
      try {
        const token = extractToken(request);
        if (!token) throw new Error("Token missing");
        try {
          // @ts-ignore
          const decoded = (await (fastify.jwt as any).verify(token, {
            secret: env.HOST_JWT_SECRET
          })) as TokenPayload;
          if (decoded.role === SessionRole.Host) {
            request.user = { sub: decoded.sub, role: SessionRole.Host };
            return;
          }
        } catch {
          // fallthrough to guest verification
        }
        // @ts-ignore
        const decodedGuest = (await (fastify.jwt as any).verify(token, {
          secret: env.GUEST_JWT_SECRET
        })) as TokenPayload;
        if (decodedGuest.role !== SessionRole.Guest) {
          throw new Error("Invalid token role");
        }
        request.user = { sub: decodedGuest.sub, role: SessionRole.Guest };
      } catch (err) {
        reply.code(401).send({ message: "Authentication failed", error: String(err) });
      }
    }
  );
});
