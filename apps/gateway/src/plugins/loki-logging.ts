/**
 * NetNynja Enterprise - Loki Request/Response Logging Plugin
 *
 * Logs all HTTP requests and responses to Loki for centralized log aggregation.
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { logger } from '../logger';
import { config } from '../config';

export interface LokiLoggingOptions {
  excludePaths?: string[];
  logRequestBody?: boolean;
  logResponseBody?: boolean;
}

const lokiLoggingPlugin: FastifyPluginAsync<LokiLoggingOptions> = async (fastify, options) => {
  const {
    excludePaths = ['/healthz', '/livez', '/readyz'],
    logRequestBody = false,
    logResponseBody = false,
  } = options;

  // Track request start time
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    (request as any).startTime = process.hrtime.bigint();
  });

  // Log request/response on completion
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split('?')[0];

    // Skip excluded paths
    if (excludePaths.some((pattern) => path.startsWith(pattern))) {
      return;
    }

    const startTime = (request as any).startTime as bigint;
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1_000_000;

    const logData: Record<string, unknown> = {
      // Request info
      requestId: request.id,
      method: request.method,
      path,
      query: request.query,
      userAgent: request.headers['user-agent'],
      referer: request.headers.referer,
      ip: request.ip,

      // Response info
      statusCode: reply.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,

      // User context (if authenticated)
      userId: (request as any).user?.sub,
      userRole: (request as any).user?.role,

      // Trace context (if OpenTelemetry is enabled)
      traceId: request.headers['x-trace-id'] || request.id,
    };

    // Optionally log request body (exclude sensitive paths)
    if (logRequestBody && !path.includes('/login') && !path.includes('/auth')) {
      logData.requestBody = request.body;
    }

    // Determine log level based on status code
    const statusCode = reply.statusCode;
    if (statusCode >= 500) {
      logger.error(logData, `${request.method} ${path} - ${statusCode}`);
    } else if (statusCode >= 400) {
      logger.warn(logData, `${request.method} ${path} - ${statusCode}`);
    } else {
      logger.info(logData, `${request.method} ${path} - ${statusCode}`);
    }
  });

  // Log errors with full details
  fastify.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    const path = request.url.split('?')[0];

    logger.error({
      requestId: request.id,
      method: request.method,
      path,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      userId: (request as any).user?.sub,
      ip: request.ip,
    }, `Request error: ${error.message}`);
  });
};

export default fp(lokiLoggingPlugin, {
  name: 'loki-logging',
  fastify: '4.x',
});
