import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import { env } from "../config/env";
import { SessionRole } from "@podster/shared";

declare module "fastify" {
  interface FastifyInstance {
    authenticateHost: any;
    authenticateGuest: any;
    issueHostToken: (payload: { hostId: string }) => string;
    issueGuestToken: (payload: { sessionId: string; guestName: string }) => string;
  }

  interface FastifyRequest {
    user?: {
      sub: string;
      role: SessionRole;
    };
  }
}

export const authPlugin = fp(async (fastify) => {
  fastify.register(fastifyJwt, {
    secret: env.HOST_JWT_SECRET
  });

  fastify.decorate("issueHostToken", (payload: { hostId: string }) =>
    fastify.jwt.sign({ sub: payload.hostId, role: SessionRole.Host })
  );

  fastify.decorate("issueGuestToken", (payload: { sessionId: string; guestName: string }) =>
    fastify.jwt.sign(
      {
        sub: payload.sessionId,
        role: SessionRole.Guest,
        name: payload.guestName
      },
      { secret: env.GUEST_JWT_SECRET }
    )
  );

  fastify.decorate(
    "authenticateHost",
    async (request: any, reply: any) => {
      try {
        const decoded = await request.jwtVerify();
        request.user = { sub: decoded.sub, role: SessionRole.Host };
      } catch (err) {
        reply.code(401).send({ message: "Host authentication failed", error: String(err) });
      }
    }
  );

  fastify.decorate(
    "authenticateGuest",
    async (request: any, reply: any) => {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) throw new Error("Guest token missing");
        const token = authHeader.replace("Bearer ", "");
        const decoded = await fastify.jwt.verify(token, { secret: env.GUEST_JWT_SECRET });
        request.user = { sub: decoded.sub as string, role: SessionRole.Guest };
      } catch (err) {
        reply.code(401).send({ message: "Guest authentication failed", error: String(err) });
      }
    }
  );
});
