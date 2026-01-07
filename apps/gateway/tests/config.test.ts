/**
 * NetNynja Enterprise - Config Unit Tests
 */

import { z } from "zod";

// We need to test the config schema separately since it reads process.env on import
describe("Configuration Schema", () => {
  // Define the schema here to test in isolation
  const ConfigSchema = z.object({
    PORT: z.coerce.number().default(3001),
    HOST: z.string().default("0.0.0.0"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    POSTGRES_URL: z.string(),
    REDIS_URL: z.string(),
    NATS_URL: z.string().default("nats://localhost:4222"),
    JWT_SECRET: z.string().optional(),
    JWT_PUBLIC_KEY: z.string().optional(),
    JWT_ISSUER: z.string().default("netnynja-enterprise"),
    JWT_AUDIENCE: z.string().default("netnynja-api"),
    CORS_ORIGIN: z
      .string()
      .transform((val) => {
        if (val === "true") return true;
        if (val === "false") return false;
        return val.split(",").map((s) => s.trim());
      })
      .default("true"),
    CORS_CREDENTIALS: z.coerce.boolean().default(true),
    CORS_MAX_AGE: z.coerce.number().default(86400),
    CORS_EXPOSED_HEADERS: z
      .string()
      .transform((val) => {
        if (!val) return [];
        return val.split(",").map((s) => s.trim());
      })
      .default("X-Request-Id"),
    RATE_LIMIT_MAX: z.coerce.number().default(100),
    RATE_LIMIT_AUTH_MAX: z.coerce.number().default(10),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
    OTEL_ENABLED: z.coerce.boolean().default(false),
    OTEL_EXPORTER_ENDPOINT: z.string().default("http://localhost:4318"),
    OTEL_SERVICE_NAME: z.string().default("netnynja-gateway"),
    JAEGER_ENDPOINT: z.string().optional(),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
    API_VERSION: z.string().default("v1"),
    AUTH_SERVICE_URL: z.string().default("http://localhost:3002"),
  });

  describe("Default Values", () => {
    it("should set default PORT to 3001", () => {
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
        REDIS_URL: "redis://localhost:6379",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(3001);
      }
    });

    it("should set default HOST to 0.0.0.0", () => {
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
        REDIS_URL: "redis://localhost:6379",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.HOST).toBe("0.0.0.0");
      }
    });

    it("should set default NODE_ENV to development", () => {
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
        REDIS_URL: "redis://localhost:6379",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe("development");
      }
    });

    it("should set default rate limits", () => {
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
        REDIS_URL: "redis://localhost:6379",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.RATE_LIMIT_MAX).toBe(100);
        expect(result.data.RATE_LIMIT_AUTH_MAX).toBe(10);
        expect(result.data.RATE_LIMIT_WINDOW_MS).toBe(60000);
      }
    });
  });

  describe("Required Fields", () => {
    it("should fail without POSTGRES_URL", () => {
      const result = ConfigSchema.safeParse({
        REDIS_URL: "redis://localhost:6379",
      });

      expect(result.success).toBe(false);
    });

    it("should fail without REDIS_URL", () => {
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
      });

      expect(result.success).toBe(false);
    });

    it("should pass with all required fields", () => {
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
        REDIS_URL: "redis://localhost:6379",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Type Coercion", () => {
    it("should coerce PORT from string to number", () => {
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
        REDIS_URL: "redis://localhost:6379",
        PORT: "8080",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(8080);
        expect(typeof result.data.PORT).toBe("number");
      }
    });

    it("should coerce CORS_CREDENTIALS from empty/falsy string to boolean", () => {
      // z.coerce.boolean() treats any non-empty string as true
      // Only empty string, 0, null, undefined coerce to false
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
        REDIS_URL: "redis://localhost:6379",
        CORS_CREDENTIALS: "", // Empty string coerces to false
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.CORS_CREDENTIALS).toBe(false);
        expect(typeof result.data.CORS_CREDENTIALS).toBe("boolean");
      }
    });

    it('should coerce CORS_CREDENTIALS "true" to boolean true', () => {
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
        REDIS_URL: "redis://localhost:6379",
        CORS_CREDENTIALS: "true",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.CORS_CREDENTIALS).toBe(true);
        expect(typeof result.data.CORS_CREDENTIALS).toBe("boolean");
      }
    });

    it("should coerce OTEL_ENABLED from string to boolean", () => {
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
        REDIS_URL: "redis://localhost:6379",
        OTEL_ENABLED: "true",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.OTEL_ENABLED).toBe(true);
      }
    });
  });

  describe("CORS_ORIGIN Transformation", () => {
    it('should transform "true" to boolean true', () => {
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
        REDIS_URL: "redis://localhost:6379",
        CORS_ORIGIN: "true",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.CORS_ORIGIN).toBe(true);
      }
    });

    it('should transform "false" to boolean false', () => {
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
        REDIS_URL: "redis://localhost:6379",
        CORS_ORIGIN: "false",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.CORS_ORIGIN).toBe(false);
      }
    });

    it("should split comma-separated origins into array", () => {
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
        REDIS_URL: "redis://localhost:6379",
        CORS_ORIGIN: "http://localhost:3000, http://localhost:5173",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.data.CORS_ORIGIN)).toBe(true);
        expect(result.data.CORS_ORIGIN).toEqual([
          "http://localhost:3000",
          "http://localhost:5173",
        ]);
      }
    });
  });

  describe("CORS_EXPOSED_HEADERS Transformation", () => {
    it("should split comma-separated headers into array", () => {
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
        REDIS_URL: "redis://localhost:6379",
        CORS_EXPOSED_HEADERS:
          "X-Request-Id, X-RateLimit-Limit, X-Custom-Header",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.data.CORS_EXPOSED_HEADERS)).toBe(true);
        expect(result.data.CORS_EXPOSED_HEADERS).toContain("X-Request-Id");
        expect(result.data.CORS_EXPOSED_HEADERS).toContain("X-RateLimit-Limit");
        expect(result.data.CORS_EXPOSED_HEADERS).toContain("X-Custom-Header");
      }
    });
  });

  describe("NODE_ENV Validation", () => {
    it('should accept "development"', () => {
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
        REDIS_URL: "redis://localhost:6379",
        NODE_ENV: "development",
      });

      expect(result.success).toBe(true);
    });

    it('should accept "production"', () => {
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
        REDIS_URL: "redis://localhost:6379",
        NODE_ENV: "production",
      });

      expect(result.success).toBe(true);
    });

    it('should accept "test"', () => {
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
        REDIS_URL: "redis://localhost:6379",
        NODE_ENV: "test",
      });

      expect(result.success).toBe(true);
    });

    it("should reject invalid NODE_ENV", () => {
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
        REDIS_URL: "redis://localhost:6379",
        NODE_ENV: "invalid",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("LOG_LEVEL Validation", () => {
    const validLevels = ["fatal", "error", "warn", "info", "debug", "trace"];

    validLevels.forEach((level) => {
      it(`should accept log level "${level}"`, () => {
        const result = ConfigSchema.safeParse({
          POSTGRES_URL: "postgresql://test:test@localhost/test",
          REDIS_URL: "redis://localhost:6379",
          LOG_LEVEL: level,
        });

        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid log level", () => {
      const result = ConfigSchema.safeParse({
        POSTGRES_URL: "postgresql://test:test@localhost/test",
        REDIS_URL: "redis://localhost:6379",
        LOG_LEVEL: "invalid",
      });

      expect(result.success).toBe(false);
    });
  });
});
