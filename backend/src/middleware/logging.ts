import fp from "fastify-plugin";

/**
 * Request/Response logging middleware
 * Logs all HTTP requests and responses with timing information
 */
export default fp(async (fastify) => {
  // Log incoming requests
  fastify.addHook("onRequest", async (request) => {
    const startTime = Date.now();
    const reqLogger = request.logger ?? request.log;
    
    // Store start time for duration calculation
    (request as any).startTime = startTime;

    reqLogger.info({
      event: "request_start",
      method: request.method,
      url: request.url,
      headers: {
        "user-agent": request.headers["user-agent"],
        "content-type": request.headers["content-type"],
        "authorization": request.headers.authorization ? "[REDACTED]" : undefined,
      },
      query: request.query,
      timestamp: new Date(startTime).toISOString(),
    }, "Incoming request");
  });

  // Log request body for POST/PUT requests (with size limit)
  fastify.addHook("preHandler", async (request) => {
    if (["POST", "PUT", "PATCH"].includes(request.method)) {
      const reqLogger = request.logger ?? request.log;
      const bodySize = JSON.stringify(request.body || {}).length;
      
      reqLogger.debug({
        event: "request_body",
        bodySize,
        body: bodySize < 1000 ? request.body : "[BODY_TOO_LARGE]",
      }, "Request body");
    }
  });

  // Log responses
  fastify.addHook("onSend", async (request, reply, payload) => {
    const reqLogger = request.logger ?? request.log;
    const duration = Date.now() - ((request as any).startTime || Date.now());
    const responseSize = typeof payload === "string" ? payload.length : 0;

    reqLogger.info({
      event: "request_complete",
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
      responseSize,
      timestamp: new Date().toISOString(),
    }, `Request completed - ${reply.statusCode} in ${duration}ms`);

    return payload;
  });

  // Log errors
  fastify.addHook("onError", async (request, reply, error) => {
    const reqLogger = request.logger ?? request.log;
    const duration = Date.now() - ((request as any).startTime || Date.now());

    reqLogger.error({
      event: "request_error",
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      },
      timestamp: new Date().toISOString(),
    }, `Request failed - ${error.message}`);
  });
});
