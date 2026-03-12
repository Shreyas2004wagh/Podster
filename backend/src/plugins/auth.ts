import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { SessionRole } from "../models/session.js";

type TokenPayload = {
  sub: string;
  role: SessionRole;
  name?: string;
  sessionId?: string;
};

declare module "fastify" {
  interface FastifyInstance {
    authenticateHost: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateGuest: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateAny: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    issueHostToken: (payload: { hostId: string }) => string;
    issueGuestToken: (payload: { guestId: string; sessionId: string; guestName: string }) => string;
  }
}

export const authPlugin = fp(async (fastify) => {
  const TOKEN_COOKIE = "podster_token";

  fastify.register(fastifyJwt, {
    secret: env.HOST_JWT_SECRET
  });

  fastify.decorate("issueHostToken", (payload: { hostId: string }) =>
    fastify.jwt.sign({ sub: payload.hostId, role: SessionRole.Host }, { key: env.HOST_JWT_SECRET })
  );

  fastify.decorate("issueGuestToken", (payload: { guestId: string; sessionId: string; guestName: string }) =>
    fastify.jwt.sign(
      {
        sub: payload.guestId,
        sessionId: payload.sessionId,
        role: SessionRole.Guest,
        name: payload.guestName
      },
      { key: env.GUEST_JWT_SECRET }
    )
  );

  const extractToken = (request: FastifyRequest) => {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) return authHeader.replace("Bearer ", "");
    return request.cookies?.[TOKEN_COOKIE] ?? null;
  };

  fastify.decorate(
    "authenticateHost",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const token = extractToken(request);
        if (!token) throw new Error("Host token missing");
        const decoded = fastify.jwt.verify<TokenPayload>(token, {
          key: env.HOST_JWT_SECRET
        });
        if (decoded.role !== SessionRole.Host) {
          throw new Error("Host token required");
        }
        request.user = { sub: decoded.sub, role: SessionRole.Host };
      } catch (err) {
        request.log.debug({ err }, "Host authentication failed");
        return reply.code(401).send({ message: "Host authentication failed" });
      }
    }
  );

  fastify.decorate(
    "authenticateGuest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const token = extractToken(request);
        if (!token) throw new Error("Guest token missing");
        const decoded = fastify.jwt.verify<TokenPayload>(token, {
          key: env.GUEST_JWT_SECRET
        });
        if (decoded.role !== SessionRole.Guest) {
          throw new Error("Guest token required");
        }
        request.user = {
          sub: decoded.sub,
          role: SessionRole.Guest,
          sessionId: decoded.sessionId ?? decoded.sub,
          name: decoded.name
        };
      } catch (err) {
        request.log.debug({ err }, "Guest authentication failed");
        return reply.code(401).send({ message: "Guest authentication failed" });
      }
    }
  );

  fastify.decorate(
    "authenticateAny",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const token = extractToken(request);
        if (!token) throw new Error("Token missing");
        try {
          const decoded = fastify.jwt.verify<TokenPayload>(token, {
            key: env.HOST_JWT_SECRET
          });
          if (decoded.role === SessionRole.Host) {
            request.user = { sub: decoded.sub, role: SessionRole.Host };
            return;
          }
        } catch {
          // fallthrough to guest verification
        }
        const decodedGuest = fastify.jwt.verify<TokenPayload>(token, {
          key: env.GUEST_JWT_SECRET
        });
        if (decodedGuest.role !== SessionRole.Guest) {
          throw new Error("Invalid token role");
        }
        request.user = {
          sub: decodedGuest.sub,
          role: SessionRole.Guest,
          sessionId: decodedGuest.sessionId ?? decodedGuest.sub,
          name: decodedGuest.name
        };
      } catch (err) {
        request.log.debug({ err }, "Authentication failed");
        return reply.code(401).send({ message: "Authentication failed" });
      }
    }
  );
});
