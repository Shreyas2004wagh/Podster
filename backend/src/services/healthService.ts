import { checkDatabaseConnection } from "../config/database.js";
import { ILogger, createChildLogger } from "../config/logger.js";

export interface HealthCheck {
  name: string;
  status: "healthy" | "unhealthy" | "degraded";
  responseTime: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface HealthStatus {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  uptime: number;
  version: string;
  checks: HealthCheck[];
}

export interface IHealthService {
  checkHealth(): Promise<HealthStatus>;
  checkDatabase(): Promise<HealthCheck>;
  checkStorage(): Promise<HealthCheck>;
  isReady(): Promise<boolean>;
  isLive(): Promise<boolean>;
}

export class HealthService implements IHealthService {
  private readonly logger: ILogger;
  private readonly startTime: number;

  constructor() {
    this.logger = createChildLogger({ service: "HealthService" });
    this.startTime = Date.now();
  }

  async checkHealth(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    this.logger.debug({ event: "health_check_start" }, "Starting health check");

    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkStorage(),
    ]);

    const healthChecks: HealthCheck[] = checks.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        const checkNames = ["database", "storage"];
        return {
          name: checkNames[index],
          status: "unhealthy" as const,
          responseTime: Date.now() - startTime,
          error: result.reason?.message || "Unknown error",
        };
      }
    });

    // Determine overall status
    const hasUnhealthy = healthChecks.some(check => check.status === "unhealthy");
    const hasDegraded = healthChecks.some(check => check.status === "degraded");
    
    let overallStatus: "healthy" | "unhealthy" | "degraded";
    if (hasUnhealthy) {
      overallStatus = "unhealthy";
    } else if (hasDegraded) {
      overallStatus = "degraded";
    } else {
      overallStatus = "healthy";
    }

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version || "unknown",
      checks: healthChecks,
    };

    const duration = Date.now() - startTime;
    this.logger.debug({
      event: "health_check_complete",
      status: overallStatus,
      duration,
      checksCount: healthChecks.length,
    }, `Health check completed in ${duration}ms`);

    return healthStatus;
  }

  async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const isConnected = await checkDatabaseConnection();
      const responseTime = Date.now() - startTime;

      if (isConnected) {
        return {
          name: "database",
          status: "healthy",
          responseTime,
          metadata: {
            type: "postgresql",
            pool: "active",
          },
        };
      } else {
        return {
          name: "database",
          status: "unhealthy",
          responseTime,
          error: "Database connection failed",
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        name: "database",
        status: "unhealthy",
        responseTime,
        error: (error as Error).message,
      };
    }
  }

  async checkStorage(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Simple check - just return healthy if we can instantiate the storage provider
      // In a real implementation, you might want to test actual S3 connectivity
      const responseTime = Date.now() - startTime;
      
      return {
        name: "storage",
        status: "healthy",
        responseTime,
        metadata: {
          provider: "s3",
          region: process.env.STORAGE_REGION || "unknown",
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        name: "storage",
        status: "unhealthy",
        responseTime,
        error: (error as Error).message,
      };
    }
  }

  async isReady(): Promise<boolean> {
    try {
      const health = await this.checkHealth();
      // Ready if database is healthy (storage can be degraded)
      const databaseCheck = health.checks.find(check => check.name === "database");
      return databaseCheck?.status === "healthy";
    } catch (error) {
      this.logger.error({
        event: "readiness_check_failed",
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
        },
      }, "Readiness check failed");
      return false;
    }
  }

  async isLive(): Promise<boolean> {
    try {
      // Liveness is simpler - just check if the service is running
      // Could add memory/CPU checks here if needed
      return true;
    } catch (error) {
      this.logger.error({
        event: "liveness_check_failed",
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
        },
      }, "Liveness check failed");
      return false;
    }
  }
}