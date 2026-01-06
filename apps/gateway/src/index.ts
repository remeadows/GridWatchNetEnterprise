/**
 * NetNynja Enterprise - Unified API Gateway Entry Point
 */

import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { config } from './config';
import { logger } from './logger';
import { closePool, checkHealth as checkDbHealth } from './db';
import { redis, closeRedis } from './redis';
import { initTelemetry, shutdownTelemetry } from './plugins/otel';
import authPlugin from './plugins/auth';
import swaggerPlugin from './plugins/swagger';
import errorHandlerPlugin from './plugins/error-handler';
import rateLimitPlugin from './plugins/rate-limit';
import lokiLoggingPlugin from './plugins/loki-logging';
import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import ipamRoutes from './routes/ipam';
import npmRoutes from './routes/npm';
import stigRoutes from './routes/stig';

// Initialize OpenTelemetry before anything else
initTelemetry();

const fastify = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    transport:
      config.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: { colorize: true },
          }
        : undefined,
  },
  trustProxy: true,
  requestIdHeader: 'x-request-id',
  genReqId: () => crypto.randomUUID(),
});

async function start(): Promise<void> {
  try {
    // Register security plugins
    await fastify.register(helmet, {
      contentSecurityPolicy: false, // API only
    });

    await fastify.register(cors, {
      origin: config.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    });

    // Register custom plugins
    await fastify.register(errorHandlerPlugin);
    await fastify.register(authPlugin);
    await fastify.register(swaggerPlugin);
    await fastify.register(rateLimitPlugin);
    await fastify.register(lokiLoggingPlugin, {
      excludePaths: ['/healthz', '/livez', '/readyz', '/docs'],
      logRequestBody: false,
      logResponseBody: false,
    });

    // Register health check routes (no prefix)
    await fastify.register(healthRoutes);

    // Register API routes
    await fastify.register(authRoutes, { prefix: '/api/v1/auth' });
    await fastify.register(ipamRoutes, { prefix: '/api/v1/ipam' });
    await fastify.register(npmRoutes, { prefix: '/api/v1/npm' });
    await fastify.register(stigRoutes, { prefix: '/api/v1/stig' });

    // Connect to Redis
    await redis.connect();
    logger.info('Connected to Redis');

    // Verify database connection
    const dbHealthy = await checkDbHealth();
    if (!dbHealthy) {
      throw new Error('Failed to connect to database');
    }
    logger.info('Connected to PostgreSQL');

    // Start server
    await fastify.listen({
      host: config.HOST,
      port: config.PORT,
    });

    logger.info(
      {
        host: config.HOST,
        port: config.PORT,
        env: config.NODE_ENV,
        swagger: `http://${config.HOST}:${config.PORT}/docs`,
      },
      `NetNynja Gateway listening on ${config.HOST}:${config.PORT}`
    );
  } catch (error) {
    const err = error as Error;
    logger.fatal({
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      }
    }, 'Failed to start gateway');
    console.error('Gateway startup error:', err);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  logger.info('Shutting down gateway...');

  try {
    await fastify.close();
    await closePool();
    await closeRedis();
    await shutdownTelemetry();
    logger.info('Gateway shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught Exception');
  process.exit(1);
});

// Start the gateway
start();
