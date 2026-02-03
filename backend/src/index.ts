
import "reflect-metadata"; // Must be first import for tsyringe
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyCookie from "@fastify/cookie";
import fastifySensible from "@fastify/sensible";
import fastifyFormbody from "@fastify/formbody";
import { env } from "./config/env.js";
import { createPrismaClient, checkDatabaseConnection } from "./config/database.js";
import { logger } from "./config/logger.js";
import { configureContainer } from "./container/container.js";
import { authPlugin } from "./plugins/auth.js";
import socketPlugin from "./plugins/socket.js";
import correlationMiddleware from "./middleware/correlation.js";
import loggingMiddleware from "./middleware/logging.js";
import metricsMiddleware from "./middleware/metrics.js";
import sessionsRoutes from "./routes/sessions.js";
import healthRoutes from "./routes/health.js";

// Configure dependency injection container
configureContainer();

const server = Fastify({
  logger: logger,
  disableRequestLogging: true, // We handle this in our middleware
});

server.register(fastifyCors, { origin: env.FRONTEND_ORIGIN, credentials: true });
server.register(fastifyCookie, {
  secret: env.COOKIE_SECRET,
  hook: "onRequest"
});
server.register(fastifySensible);
server.register(fastifyFormbody);

// Register middleware (order matters)
server.register(correlationMiddleware);
server.register(metricsMiddleware);
server.register(loggingMiddleware);

// Register plugins
server.register(authPlugin);
server.register(socketPlugin);

// Register routes
server.register(healthRoutes);
server.register(sessionsRoutes);

// Initialize database connection
const prisma = createPrismaClient();

server.listen({ port: env.PORT, host: "0.0.0.0" }, async (err, address) => {
  if (err) {
    logger.error({ error: err }, "Server startup failed");
    process.exit(1);
  }
  
  // Check database connection on startup
  try {
    const dbHealthy = await checkDatabaseConnection();
    if (dbHealthy) {
      logger.info({ event: "database_connected" }, "Database connection established");
    } else {
      logger.warn({ event: "database_connection_failed" }, "Database connection failed - server will continue but may not function properly");
    }
  } catch (error) {
    logger.error({ 
      event: "database_check_error",
      error: {
        name: (error as Error).name,
        message: (error as Error).message,
      }
    }, "Database connection check failed");
  }
  
  logger.info({ 
    event: "server_started",
    address,
    port: env.PORT,
    nodeEnv: process.env.NODE_ENV,
    version: process.env.npm_package_version || "unknown",
  }, `🚀 Podster backend server listening on ${address}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info({ event: "shutdown_sigterm" }, 'SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  await server.close();
  logger.info({ event: "shutdown_complete" }, 'Server shutdown complete');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info({ event: "shutdown_sigint" }, 'SIGINT received, shutting down gracefully');
  await prisma.$disconnect();
  await server.close();
  logger.info({ event: "shutdown_complete" }, 'Server shutdown complete');
  process.exit(0);
});
