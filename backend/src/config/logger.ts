import pino from "pino";

// Log levels: trace, debug, info, warn, error, fatal
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug");

/**
 * Create and configure the application logger
 */
export function createLogger() {
  const isDevelopment = process.env.NODE_ENV !== "production";
  
  return pino({
    level: logLevel,
    // Use pretty printing in development
    transport: isDevelopment ? {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    } : undefined,
    // Production configuration
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Base fields for all log entries
    base: {
      pid: process.pid,
      hostname: process.env.HOSTNAME || "unknown",
      service: "podster-backend",
      version: process.env.npm_package_version || "unknown",
    },
  });
}

/**
 * Global logger instance
 */
export const logger = createLogger();

/**
 * Create a child logger with additional context
 */
export function createChildLogger(context: Record<string, any>) {
  return logger.child(context);
}

/**
 * Logger interface for dependency injection
 */
export interface ILogger {
  trace(obj: any, msg?: string): void;
  debug(obj: any, msg?: string): void;
  info(obj: any, msg?: string): void;
  warn(obj: any, msg?: string): void;
  error(obj: any, msg?: string): void;
  fatal(obj: any, msg?: string): void;
  child(bindings: Record<string, any>): ILogger;
}

/**
 * Pino logger wrapper that implements ILogger interface
 */
export class PinoLogger implements ILogger {
  constructor(private readonly pinoLogger: pino.Logger) {}

  trace(obj: any, msg?: string): void {
    this.pinoLogger.trace(obj, msg);
  }

  debug(obj: any, msg?: string): void {
    this.pinoLogger.debug(obj, msg);
  }

  info(obj: any, msg?: string): void {
    this.pinoLogger.info(obj, msg);
  }

  warn(obj: any, msg?: string): void {
    this.pinoLogger.warn(obj, msg);
  }

  error(obj: any, msg?: string): void {
    this.pinoLogger.error(obj, msg);
  }

  fatal(obj: any, msg?: string): void {
    this.pinoLogger.fatal(obj, msg);
  }

  child(bindings: Record<string, any>): ILogger {
    return new PinoLogger(this.pinoLogger.child(bindings));
  }
}