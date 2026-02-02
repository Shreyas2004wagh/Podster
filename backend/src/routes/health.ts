import fp from "fastify-plugin";
import { register } from "../config/metrics.js";
import { resolve, TOKENS } from "../container/container.js";
import { IHealthService } from "../services/healthService.js";

export default fp(async (fastify) => {
  const healthService = resolve<IHealthService>(TOKENS.HealthService);

  // Basic health check endpoint
  fastify.get("/health", async (request, reply) => {
    try {
      const health = await healthService.checkHealth();
      
      const statusCode = health.status === "healthy" ? 200 : 
                        health.status === "degraded" ? 200 : 503;
      
      reply.code(statusCode).send(health);
    } catch (error) {
      request.logger.error({
        event: "health_check_error",
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack,
        },
      }, "Health check failed");
      
      reply.code(503).send({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      });
    }
  });

  // Kubernetes readiness probe
  fastify.get("/ready", async (request, reply) => {
    try {
      const isReady = await healthService.isReady();
      
      if (isReady) {
        reply.code(200).send({ status: "ready" });
      } else {
        reply.code(503).send({ status: "not ready" });
      }
    } catch (error) {
      request.logger.error({
        event: "readiness_check_error",
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
        },
      }, "Readiness check failed");
      
      reply.code(503).send({ status: "not ready", error: (error as Error).message });
    }
  });

  // Kubernetes liveness probe
  fastify.get("/live", async (request, reply) => {
    try {
      const isLive = await healthService.isLive();
      
      if (isLive) {
        reply.code(200).send({ status: "alive" });
      } else {
        reply.code(503).send({ status: "not alive" });
      }
    } catch (error) {
      request.logger.error({
        event: "liveness_check_error",
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
        },
      }, "Liveness check failed");
      
      reply.code(503).send({ status: "not alive", error: (error as Error).message });
    }
  });

  // Prometheus metrics endpoint
  fastify.get("/metrics", async (request, reply) => {
    try {
      const metrics = await register.metrics();
      reply.type("text/plain").send(metrics);
    } catch (error) {
      request.logger.error({
        event: "metrics_export_error",
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
        },
      }, "Metrics export failed");
      
      reply.code(500).send({ error: "Failed to export metrics" });
    }
  });

  // Detailed health status (for debugging)
  fastify.get("/health/detailed", async (request, reply) => {
    try {
      const health = await healthService.checkHealth();
      
      // Add additional system information
      const detailedHealth = {
        ...health,
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          memory: process.memoryUsage(),
          uptime: process.uptime(),
          pid: process.pid,
        },
        environment: {
          nodeEnv: process.env.NODE_ENV,
          logLevel: process.env.LOG_LEVEL,
        },
      };
      
      const statusCode = health.status === "healthy" ? 200 : 
                        health.status === "degraded" ? 200 : 503;
      
      reply.code(statusCode).send(detailedHealth);
    } catch (error) {
      request.logger.error({
        event: "detailed_health_check_error",
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack,
        },
      }, "Detailed health check failed");
      
      reply.code(503).send({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      });
    }
  });
});