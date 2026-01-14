/**
 * NetNynja Enterprise - Auth Service Entry Point
 */

import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import { config } from "./config";
import { logger } from "./logger";
import { registerRoutes } from "./routes";
import { pool, closePool, checkHealth as checkDbHealth } from "./db";
import { redis, closeRedis, checkHealth as checkRedisHealth } from "./redis";

// Determine trustProxy value:
// - If TRUST_PROXY is explicitly set, use that value
// - Otherwise, default to true in development (for dev servers), false in production
const trustProxyValue =
  config.TRUST_PROXY !== undefined
    ? config.TRUST_PROXY
    : config.NODE_ENV === "development";

const fastify = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    transport:
      config.NODE_ENV === "development"
        ? {
            target: "pino-pretty",
            options: { colorize: true },
          }
        : undefined,
  },
  trustProxy: trustProxyValue,
});

async function start(): Promise<void> {
  try {
    // Register security plugins
    await fastify.register(helmet, {
      contentSecurityPolicy: false, // API only
    });

    await fastify.register(cors, {
      origin: config.NODE_ENV === "development" ? true : false,
      credentials: true,
    });

    await fastify.register(rateLimit, {
      max: config.RATE_LIMIT_MAX,
      timeWindow: config.RATE_LIMIT_WINDOW_MS,
    });

    // Register cookie plugin for HttpOnly refresh tokens
    await fastify.register(cookie, {
      secret: config.JWT_SECRET, // Used for signing cookies
      parseOptions: {},
    });

    // Register routes
    await registerRoutes(fastify);

    // Health check endpoint (detailed)
    fastify.get("/healthz", async (request, reply) => {
      const dbHealthy = await checkDbHealth();
      const redisHealthy = await checkRedisHealth();

      const status = dbHealthy && redisHealthy ? "healthy" : "unhealthy";
      const statusCode = status === "healthy" ? 200 : 503;

      reply.status(statusCode);
      return {
        status,
        timestamp: new Date().toISOString(),
        services: {
          database: dbHealthy ? "up" : "down",
          redis: redisHealthy ? "up" : "down",
        },
      };
    });

    // Connect to Redis
    await redis.connect();
    logger.info("Connected to Redis");

    // Start server
    await fastify.listen({
      host: config.HOST,
      port: config.PORT,
    });

    logger.info(
      { host: config.HOST, port: config.PORT },
      `Auth service listening on ${config.HOST}:${config.PORT}`,
    );
  } catch (error) {
    logger.fatal({ error }, "Failed to start auth service");
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  logger.info("Shutting down auth service...");

  try {
    await fastify.close();
    await closePool();
    await closeRedis();
    logger.info("Auth service shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error({ error }, "Error during shutdown");
    process.exit(1);
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Handle uncaught errors
process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise }, "Unhandled Rejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ error }, "Uncaught Exception");
  process.exit(1);
});

// Start the service
start();
