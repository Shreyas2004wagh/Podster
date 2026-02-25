import type { SessionRole } from "../models/session.js";

declare module "fastify" {
  interface FastifyRequest {
    startTime?: number;
    metricsStartTime?: number;
    user?: {
      sub: string;
      role: SessionRole;
    };
  }
}
