import client from "prom-client";

// Create a Registry to register the metrics
export const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({
  register,
  prefix: "podster_",
});

// HTTP Request Metrics
export const httpRequestsTotal = new client.Counter({
  name: "podster_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

export const httpRequestDuration = new client.Histogram({
  name: "podster_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
  registers: [register],
});

export const httpRequestsInFlight = new client.Gauge({
  name: "podster_http_requests_in_flight",
  help: "Number of HTTP requests currently being processed",
  registers: [register],
});

// Business Metrics
export const sessionsCreated = new client.Counter({
  name: "podster_sessions_created_total",
  help: "Total number of sessions created",
  labelNames: ["status"],
  registers: [register],
});

export const tracksUploaded = new client.Counter({
  name: "podster_tracks_uploaded_total",
  help: "Total number of tracks uploaded",
  labelNames: ["kind", "status"],
  registers: [register],
});

export const uploadFailures = new client.Counter({
  name: "podster_upload_failures_total",
  help: "Total number of upload failures",
  labelNames: ["error_type"],
  registers: [register],
});

export const uploadDuration = new client.Histogram({
  name: "podster_upload_duration_seconds",
  help: "Duration of upload operations in seconds",
  labelNames: ["operation"],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300],
  registers: [register],
});

// Database Metrics
export const databaseConnections = new client.Gauge({
  name: "podster_database_connections",
  help: "Number of active database connections",
  registers: [register],
});

export const databaseQueryDuration = new client.Histogram({
  name: "podster_database_query_duration_seconds",
  help: "Duration of database queries in seconds",
  labelNames: ["operation", "table"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

export const databaseErrors = new client.Counter({
  name: "podster_database_errors_total",
  help: "Total number of database errors",
  labelNames: ["operation", "error_type"],
  registers: [register],
});

// Storage Metrics
export const storageOperations = new client.Counter({
  name: "podster_storage_operations_total",
  help: "Total number of storage operations",
  labelNames: ["operation", "provider", "status"],
  registers: [register],
});

export const storageOperationDuration = new client.Histogram({
  name: "podster_storage_operation_duration_seconds",
  help: "Duration of storage operations in seconds",
  labelNames: ["operation", "provider"],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
  registers: [register],
});

/**
 * Metrics interface for dependency injection
 */
export interface IMetrics {
  // HTTP metrics
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void;
  incrementHttpRequestsInFlight(): void;
  decrementHttpRequestsInFlight(): void;
  
  // Business metrics
  recordSessionCreated(status: string): void;
  recordTrackUploaded(kind: string, status: string): void;
  recordUploadFailure(errorType: string): void;
  recordUploadDuration(operation: string, duration: number): void;
  
  // Database metrics
  setDatabaseConnections(count: number): void;
  recordDatabaseQuery(operation: string, table: string, duration: number): void;
  recordDatabaseError(operation: string, errorType: string): void;
  
  // Storage metrics
  recordStorageOperation(operation: string, provider: string, status: string, duration: number): void;
}

/**
 * Prometheus metrics implementation
 */
export class PrometheusMetrics implements IMetrics {
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void {
    httpRequestsTotal.inc({ method, route, status_code: statusCode.toString() });
    httpRequestDuration.observe({ method, route, status_code: statusCode.toString() }, duration / 1000);
  }

  incrementHttpRequestsInFlight(): void {
    httpRequestsInFlight.inc();
  }

  decrementHttpRequestsInFlight(): void {
    httpRequestsInFlight.dec();
  }

  recordSessionCreated(status: string): void {
    sessionsCreated.inc({ status });
  }

  recordTrackUploaded(kind: string, status: string): void {
    tracksUploaded.inc({ kind, status });
  }

  recordUploadFailure(errorType: string): void {
    uploadFailures.inc({ error_type: errorType });
  }

  recordUploadDuration(operation: string, duration: number): void {
    uploadDuration.observe({ operation }, duration / 1000);
  }

  setDatabaseConnections(count: number): void {
    databaseConnections.set(count);
  }

  recordDatabaseQuery(operation: string, table: string, duration: number): void {
    databaseQueryDuration.observe({ operation, table }, duration / 1000);
  }

  recordDatabaseError(operation: string, errorType: string): void {
    databaseErrors.inc({ operation, error_type: errorType });
  }

  recordStorageOperation(operation: string, provider: string, status: string, duration: number): void {
    storageOperations.inc({ operation, provider, status });
    storageOperationDuration.observe({ operation, provider }, duration / 1000);
  }
}