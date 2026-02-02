import "reflect-metadata";
import { container } from "tsyringe";
import { createPrismaClient } from "../config/database.js";
import { 
  PrismaSessionRepository,
  PrismaTrackRepository,
  PrismaUploadTargetRepository
} from "../repositories/index.js";
import { SessionService } from "../services/sessionService.js";
import { HealthService } from "../services/healthService.js";
import { S3StorageProvider } from "../storage/s3Storage.js";
import { PinoLogger, createLogger } from "../config/logger.js";
import { PrometheusMetrics } from "../config/metrics.js";

// Service registration tokens
export const TOKENS = {
  // Database
  PrismaClient: "PrismaClient",
  
  // Repositories
  SessionRepository: "SessionRepository",
  TrackRepository: "TrackRepository", 
  UploadTargetRepository: "UploadTargetRepository",
  
  // Services
  SessionService: "SessionService",
  HealthService: "HealthService",
  StorageProvider: "StorageProvider",
  
  // Infrastructure
  Logger: "Logger",
  Metrics: "Metrics",
} as const;

/**
 * Configure the dependency injection container
 * This function registers all services and their dependencies
 */
export function configureContainer(): void {
  // Register database client as singleton
  const prisma = createPrismaClient();
  container.registerInstance(TOKENS.PrismaClient, prisma);

  // Register infrastructure services
  container.registerInstance(TOKENS.Logger, new PinoLogger(createLogger()));
  container.registerInstance(TOKENS.Metrics, new PrometheusMetrics());

  // Register repositories
  container.registerInstance(TOKENS.SessionRepository, new PrismaSessionRepository(prisma));
  container.registerInstance(TOKENS.TrackRepository, new PrismaTrackRepository(prisma));
  container.registerInstance(TOKENS.UploadTargetRepository, new PrismaUploadTargetRepository(prisma));

  // Register storage provider
  container.registerInstance(TOKENS.StorageProvider, new S3StorageProvider());

  // Register business services
  const sessionService = new SessionService(
    container.resolve(TOKENS.SessionRepository),
    container.resolve(TOKENS.TrackRepository),
    container.resolve(TOKENS.UploadTargetRepository),
    container.resolve(TOKENS.StorageProvider)
  );
  container.registerInstance(TOKENS.SessionService, sessionService);
  
  // Register health service
  container.registerInstance(TOKENS.HealthService, new HealthService());
}

/**
 * Get the configured container instance
 */
export function getContainer() {
  return container;
}

/**
 * Resolve a service from the container
 */
export function resolve<T>(token: string): T {
  return container.resolve<T>(token);
}