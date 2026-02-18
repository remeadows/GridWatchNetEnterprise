/**
 * GridWatch NetEnterprise - Gateway Health Check Routes
 */

import type { FastifyPluginAsync } from "fastify";
import { pool, checkHealth as checkDbHealth } from "../db";
import { redis, checkHealth as checkRedisHealth } from "../redis";

interface HealthStatus {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  version: string;
  services: {
    database: "up" | "down";
    redis: "up" | "down";
  };
}

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Simple liveness probe
  fastify.get(
    "/livez",
    {
      schema: {
        tags: ["Health"],
        summary: "Liveness probe",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
            },
          },
        },
      },
    },
    async () => {
      return { status: "ok" };
    },
  );

  // Readiness probe (checks dependencies)
  fastify.get(
    "/readyz",
    {
      schema: {
        tags: ["Health"],
        summary: "Readiness probe",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
            },
          },
          503: {
            type: "object",
            properties: {
              status: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const dbHealthy = await checkDbHealth();
      const redisHealthy = await checkRedisHealth();

      if (dbHealthy && redisHealthy) {
        return { status: "ok" };
      }

      reply.status(503);
      return { status: "not ready" };
    },
  );

  // Detailed health check
  fastify.get(
    "/healthz",
    {
      schema: {
        tags: ["Health"],
        summary: "Detailed health check",
        response: {
          200: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["healthy", "unhealthy", "degraded"],
              },
              timestamp: { type: "string" },
              version: { type: "string" },
              services: {
                type: "object",
                properties: {
                  database: { type: "string", enum: ["up", "down"] },
                  redis: { type: "string", enum: ["up", "down"] },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const dbHealthy = await checkDbHealth();
      const redisHealthy = await checkRedisHealth();

      let status: "healthy" | "unhealthy" | "degraded";
      if (dbHealthy && redisHealthy) {
        status = "healthy";
      } else if (dbHealthy || redisHealthy) {
        status = "degraded";
      } else {
        status = "unhealthy";
      }

      const response: HealthStatus = {
        status,
        timestamp: new Date().toISOString(),
        version: "0.1.0",
        services: {
          database: dbHealthy ? "up" : "down",
          redis: redisHealthy ? "up" : "down",
        },
      };

      const statusCode = status === "unhealthy" ? 503 : 200;
      reply.status(statusCode);
      return response;
    },
  );
};

export default healthRoutes;
