import pino from "pino";

type LogContext = Record<string, unknown>;

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
export function createChildLogger(context: LogContext) {
  return logger.child(context);
}

/**
 * Logger interface for dependency injection
 */
export interface ILogger {
  trace(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  fatal(obj: unknown, msg?: string): void;
  child(bindings: LogContext): ILogger;
}

/**
 * Pino logger wrapper that implements ILogger interface
 */
export class PinoLogger implements ILogger {
  constructor(private readonly pinoLogger: pino.Logger) {}

  trace(obj: unknown, msg?: string): void {
    this.pinoLogger.trace(obj, msg);
  }

  debug(obj: unknown, msg?: string): void {
    this.pinoLogger.debug(obj, msg);
  }

  info(obj: unknown, msg?: string): void {
    this.pinoLogger.info(obj, msg);
  }

  warn(obj: unknown, msg?: string): void {
    this.pinoLogger.warn(obj, msg);
  }

  error(obj: unknown, msg?: string): void {
    this.pinoLogger.error(obj, msg);
  }

  fatal(obj: unknown, msg?: string): void {
    this.pinoLogger.fatal(obj, msg);
  }

  child(bindings: LogContext): ILogger {
    return new PinoLogger(this.pinoLogger.child(bindings));
  }
}
