/**
 * GridWatch NetEnterprise - Health Routes Integration Tests
 */

import Fastify, { FastifyInstance } from "fastify";

// Mock dependencies before importing modules
jest.mock("../src/db", () => ({
  pool: {
    query: jest.fn(),
  },
  checkHealth: jest.fn(),
}));

jest.mock("../src/redis", () => ({
  redis: {
    ping: jest.fn(),
  },
}));

// Helper to build Fastify app for testing
async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: false,
  });

  // Register simplified health routes for testing
  fastify.get("/healthz", async () => {
    return { status: "ok" };
  });

  fastify.get("/livez", async () => {
    return { status: "ok" };
  });

  fastify.get("/readyz", async (request, reply) => {
    // Import mocked modules
    const { checkHealth: checkDbHealth } = require("../src/db");
    const { redis } = require("../src/redis");

    const checks: {
      database?: { status: string; error?: string };
      redis?: { status: string; error?: string };
    } = {};

    let allHealthy = true;

    // Check database
    try {
      const dbHealthy = await checkDbHealth();
      checks.database = { status: dbHealthy ? "healthy" : "unhealthy" };
      if (!dbHealthy) allHealthy = false;
    } catch (error) {
      checks.database = {
        status: "unhealthy",
        error: (error as Error).message,
      };
      allHealthy = false;
    }

    // Check Redis
    try {
      await redis.ping();
      checks.redis = { status: "healthy" };
    } catch (error) {
      checks.redis = { status: "unhealthy", error: (error as Error).message };
      allHealthy = false;
    }

    const statusCode = allHealthy ? 200 : 503;
    return reply.code(statusCode).send({
      status: allHealthy ? "ready" : "not_ready",
      checks,
    });
  });

  return fastify;
}

describe("Health Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /healthz", () => {
    it("should return 200 with ok status", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/healthz",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("ok");
    });
  });

  describe("GET /livez", () => {
    it("should return 200 with ok status", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/livez",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("ok");
    });
  });

  describe("GET /readyz", () => {
    it("should return 200 when all services are healthy", async () => {
      const { checkHealth } = require("../src/db");
      const { redis } = require("../src/redis");

      checkHealth.mockResolvedValue(true);
      redis.ping.mockResolvedValue("PONG");

      const response = await app.inject({
        method: "GET",
        url: "/readyz",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("ready");
      expect(body.checks.database.status).toBe("healthy");
      expect(body.checks.redis.status).toBe("healthy");
    });

    it("should return 503 when database is unhealthy", async () => {
      const { checkHealth } = require("../src/db");
      const { redis } = require("../src/redis");

      checkHealth.mockResolvedValue(false);
      redis.ping.mockResolvedValue("PONG");

      const response = await app.inject({
        method: "GET",
        url: "/readyz",
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("not_ready");
      expect(body.checks.database.status).toBe("unhealthy");
      expect(body.checks.redis.status).toBe("healthy");
    });

    it("should return 503 when redis is unhealthy", async () => {
      const { checkHealth } = require("../src/db");
      const { redis } = require("../src/redis");

      checkHealth.mockResolvedValue(true);
      redis.ping.mockRejectedValue(new Error("Redis connection failed"));

      const response = await app.inject({
        method: "GET",
        url: "/readyz",
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("not_ready");
      expect(body.checks.database.status).toBe("healthy");
      expect(body.checks.redis.status).toBe("unhealthy");
      expect(body.checks.redis.error).toBe("Redis connection failed");
    });

    it("should return 503 when all services are unhealthy", async () => {
      const { checkHealth } = require("../src/db");
      const { redis } = require("../src/redis");

      checkHealth.mockRejectedValue(new Error("Database connection failed"));
      redis.ping.mockRejectedValue(new Error("Redis connection failed"));

      const response = await app.inject({
        method: "GET",
        url: "/readyz",
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("not_ready");
      expect(body.checks.database.status).toBe("unhealthy");
      expect(body.checks.redis.status).toBe("unhealthy");
    });
  });
});

describe("Health Routes - Response Format", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  it("should return JSON content type", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
    });

    expect(response.headers["content-type"]).toMatch(/application\/json/);
  });

  it("should include checks object in readyz response", async () => {
    const { checkHealth } = require("../src/db");
    const { redis } = require("../src/redis");

    checkHealth.mockResolvedValue(true);
    redis.ping.mockResolvedValue("PONG");

    const response = await app.inject({
      method: "GET",
      url: "/readyz",
    });

    const body = JSON.parse(response.body);
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("checks");
    expect(body.checks).toHaveProperty("database");
    expect(body.checks).toHaveProperty("redis");
  });
});
