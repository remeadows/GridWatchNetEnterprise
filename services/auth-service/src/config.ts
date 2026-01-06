/**
 * NetNynja Enterprise - Auth Service Configuration
 */

import { z } from 'zod';

const ConfigSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3002),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  POSTGRES_URL: z.string(),

  // Redis
  REDIS_URL: z.string(),

  // JWT
  JWT_SECRET: z.string().optional(),
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  JWT_ISSUER: z.string().default('netnynja-enterprise'),
  JWT_AUDIENCE: z.string().default('netnynja-api'),

  // Security
  MAX_LOGIN_ATTEMPTS: z.coerce.number().default(5),
  LOCKOUT_DURATION_MINUTES: z.coerce.number().default(15),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const result = ConfigSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Configuration validation failed:');
    console.error(result.error.format());
    process.exit(1);
  }

  // Validate that we have at least one JWT signing method
  const config = result.data;
  if (!config.JWT_SECRET && !config.JWT_PRIVATE_KEY) {
    console.error('Either JWT_SECRET or JWT_PRIVATE_KEY must be provided');
    process.exit(1);
  }

  return config;
}

export const config = loadConfig();
