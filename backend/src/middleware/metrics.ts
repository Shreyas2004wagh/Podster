import fp from "fastify-plugin";
import { IMetrics, PrometheusMetrics } from "../config/metrics.js";

declare module "fastify" {
  interface FastifyRequest {
    metrics: IMetrics;
  }
}

/**
 * Metrics middleware
 * Automatically collects HTTP request metrics
 */
export default fp(async (fastify) => {
  const metrics = new PrometheusMetrics();

  // Add metrics to request context
  fastify.addHook("onRequest", (request) => {
    request.metrics = metrics;
    
    // Increment in-flight requests
    metrics.incrementHttpRequestsInFlight();
    
    // Store start time for duration calculation
    request.metricsStartTime = Date.now();
  });

  // Record metrics on response
  fastify.addHook("onResponse", (request, reply) => {
    const duration = Date.now() - (request.metricsStartTime ?? Date.now());
    
    // Decrement in-flight requests
    metrics.decrementHttpRequestsInFlight();
    
    // Extract route pattern (remove dynamic segments)
    const route = request.routeOptions?.url || request.url.split("?")[0];
    
    // Record HTTP request metrics
    metrics.recordHttpRequest(
      request.method,
      route,
      reply.statusCode,
      duration
    );
  });
});
