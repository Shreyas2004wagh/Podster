import fp from "fastify-plugin";
import { v4 as uuidv4 } from "uuid";
import { createChildLogger } from "../config/logger.js";

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
    logger: ReturnType<typeof createChildLogger>;
  }
}

/**
 * Correlation ID middleware
 * Adds a unique correlation ID to each request for tracing
 */
export default fp(async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    // Get correlation ID from header or generate new one
    const correlationId = 
      (request.headers["x-correlation-id"] as string) ||
      (request.headers["x-request-id"] as string) ||
      uuidv4();

    // Add correlation ID to request
    request.correlationId = correlationId;

    // Create request-scoped logger with correlation ID
    request.logger = createChildLogger({
      correlationId,
      method: request.method,
      url: request.url,
      userAgent: request.headers["user-agent"],
      ip: request.ip,
    });

    // Add correlation ID to response headers
    reply.header("x-correlation-id", correlationId);
  });
});