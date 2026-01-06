/**
 * NetNynja Enterprise - API Gateway Configuration
 */

import { z } from 'zod';

const ConfigSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  POSTGRES_URL: z.string(),

  // Redis
  REDIS_URL: z.string(),

  // NATS
  NATS_URL: z.string().default('nats://localhost:4222'),

  // JWT
  JWT_SECRET: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_ISSUER: z.string().default('netnynja-enterprise'),
  JWT_AUDIENCE: z.string().default('netnynja-api'),

  // CORS
  CORS_ORIGIN: z.string().transform((val) => {
    if (val === 'true') return true;
    if (val === 'false') return false;
    return val.split(',').map((s) => s.trim());
  }).default('true'),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),

  // Observability
  OTEL_ENABLED: z.coerce.boolean().default(false),
  OTEL_EXPORTER_ENDPOINT: z.string().default('http://localhost:4318'),
  OTEL_SERVICE_NAME: z.string().default('netnynja-gateway'),
  JAEGER_ENDPOINT: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // API Versioning
  API_VERSION: z.string().default('v1'),

  // Backend Services
  AUTH_SERVICE_URL: z.string().default('http://localhost:3002'),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const result = ConfigSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Configuration validation failed:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
