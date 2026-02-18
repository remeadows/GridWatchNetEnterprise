/**
 * GridWatch NetEnterprise - API Gateway Configuration
 */

import { z } from "zod";

const ConfigSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Database
  POSTGRES_URL: z.string(),

  // Redis
  REDIS_URL: z.string(),

  // NATS
  NATS_URL: z.string().default("nats://localhost:4222"),

  // JWT
  JWT_SECRET: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_ISSUER: z.string().default("gridwatch-net-enterprise"),
  JWT_AUDIENCE: z.string().default("gridwatch-api"),

  // CORS - In production, use explicit allowlist (e.g., "https://app.gridwatch.io")
  // Default "true" allows any origin (only safe in development)
  CORS_ORIGIN: z
    .string()
    .transform((val) => {
      if (val === "true") return true;
      if (val === "false") return false;
      return val.split(",").map((s) => s.trim());
    })
    .default("http://localhost:5173,http://localhost:3000"),
  CORS_CREDENTIALS: z.coerce.boolean().default(true),
  CORS_MAX_AGE: z.coerce.number().default(86400), // Preflight cache duration in seconds (24h)
  CORS_EXPOSED_HEADERS: z
    .string()
    .transform((val) => {
      if (!val) return [];
      return val.split(",").map((s) => s.trim());
    })
    .default(
      "X-Request-Id,X-RateLimit-Limit,X-RateLimit-Remaining,X-RateLimit-Reset",
    ),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().default(100), // Default requests per window
  RATE_LIMIT_AUTH_MAX: z.coerce.number().default(10), // Auth endpoint limit (stricter)
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000), // Window size in ms (1 minute)

  // Observability
  OTEL_ENABLED: z.coerce.boolean().default(false),
  OTEL_EXPORTER_ENDPOINT: z.string().default("http://localhost:4318"),
  OTEL_SERVICE_NAME: z.string().default("gridwatch-gateway"),
  JAEGER_ENDPOINT: z.string().optional(),

  // Logging
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  // API Versioning
  API_VERSION: z.string().default("v1"),

  // Backend Services
  AUTH_SERVICE_URL: z.string().default("http://localhost:3006"),
  STIG_SERVICE_URL: z.string().default("http://localhost:3005"),

  // Encryption - MUST be set via environment variable in production (min 32 chars)
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(32),

  // Metrics endpoint security
  METRICS_AUTH_ENABLED: z.coerce.boolean().default(true),
  METRICS_ALLOWED_IPS: z
    .string()
    .transform((val) => {
      if (!val) return [];
      return val.split(",").map((s) => s.trim());
    })
    .default("127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"),

  // Proxy trust configuration
  // - "true" trusts all proxies (only for development behind trusted load balancer)
  // - "false" disables proxy trust (direct client connections)
  // - comma-separated IPs/CIDRs: trust only those proxies (recommended for production)
  // See: https://fastify.dev/docs/latest/Reference/Server/#trustproxy
  TRUST_PROXY: z
    .string()
    .transform((val) => {
      if (val === "true") return true;
      if (val === "false") return false;
      // Parse as comma-separated list of trusted proxy IPs/CIDRs
      return val.split(",").map((s) => s.trim());
    })
    .default("true"), // Default to true for dev; override in production
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const result = ConfigSchema.safeParse(process.env);

  if (!result.success) {
    console.error("Configuration validation failed:");
    console.error(result.error.format());
    process.exit(1);
  }

  const config = result.data;

  // Security warnings for production
  if (config.NODE_ENV === "production") {
    if (config.CORS_ORIGIN === true) {
      console.error(
        "SECURITY ERROR: CORS_ORIGIN=true (allow all origins) is not permitted in production.",
      );
      console.error(
        "Set CORS_ORIGIN to an explicit allowlist (e.g., 'https://app.gridwatch.io')",
      );
      process.exit(1);
    }

    // Warn about trustProxy in production (not a fatal error, but security concern)
    if (config.TRUST_PROXY === true) {
      console.warn(
        "SECURITY WARNING: TRUST_PROXY=true accepts X-Forwarded-For from any client.",
      );
      console.warn(
        "In production, set TRUST_PROXY to a comma-separated list of trusted proxy IPs.",
      );
      console.warn(
        "Example: TRUST_PROXY='10.0.0.1,172.16.0.0/12' or TRUST_PROXY='false' for direct connections.",
      );
    }
  }

  return config;
}

export const config = loadConfig();
