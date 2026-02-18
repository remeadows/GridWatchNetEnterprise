/**
 * GridWatch NetEnterprise - Gateway Rate Limiting Plugin
 *
 * Provides tiered rate limiting:
 * - Global default limits for all authenticated users
 * - Stricter limits for authentication endpoints (login, register)
 * - Higher limits for admin/operator roles
 * - Skip rate limiting for health check endpoints
 */

import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import { config } from "../config";
import { redis } from "../redis";

// Paths to skip rate limiting entirely
const SKIP_PATHS = ["/healthz", "/livez", "/readyz", "/docs", "/docs/"];

// Auth endpoints with stricter limits (prevent brute force)
const AUTH_PATHS = ["/api/v1/auth/login", "/api/v1/auth/register"];

// Role-based rate limit multipliers
const ROLE_MULTIPLIERS: Record<string, number> = {
  admin: 3, // Admins get 3x the default limit
  operator: 2, // Operators get 2x the default limit
  viewer: 1, // Viewers get the default limit
};

/**
 * Calculate rate limit based on user role
 */
function getRateLimitForRole(role?: string): number {
  const multiplier = role ? (ROLE_MULTIPLIERS[role] ?? 1) : 1;
  return config.RATE_LIMIT_MAX * multiplier;
}

/**
 * Check if path should skip rate limiting
 */
function shouldSkipRateLimit(path: string): boolean {
  return SKIP_PATHS.some((skip) => path === skip || path.startsWith(skip));
}

/**
 * Check if path is an auth endpoint (stricter limits)
 */
function isAuthPath(path: string): boolean {
  return AUTH_PATHS.some((authPath) => path === authPath);
}

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  // Global rate limiter for all routes
  await fastify.register(rateLimit, {
    global: true,
    max: (request: FastifyRequest, _key: string) => {
      // Stricter limits for auth endpoints (prevent brute force)
      if (isAuthPath(request.url)) {
        return config.RATE_LIMIT_AUTH_MAX;
      }

      // Role-based limits for authenticated users
      if (request.user) {
        return getRateLimitForRole(request.user.role);
      }

      // Default limit for unauthenticated requests
      return config.RATE_LIMIT_MAX;
    },
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    redis,
    // Skip rate limiting for health check and docs endpoints
    allowList: (request: FastifyRequest) => shouldSkipRateLimit(request.url),
    keyGenerator: (request: FastifyRequest) => {
      // For auth endpoints, always use IP to prevent credential stuffing
      if (isAuthPath(request.url)) {
        return `auth:${request.ip}`;
      }

      // Use user ID if authenticated, otherwise use IP
      if (request.user) {
        return `user:${request.user.sub}`;
      }
      return `ip:${request.ip}`;
    },
    errorResponseBuilder: (_request, context) => ({
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
        retryAfter: Math.ceil(context.ttl / 1000), // Convert to seconds
      },
    }),
    addHeadersOnExceeding: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
    },
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
      "retry-after": true,
    },
  });

  fastify.log.info(
    {
      defaultMax: config.RATE_LIMIT_MAX,
      authMax: config.RATE_LIMIT_AUTH_MAX,
      windowMs: config.RATE_LIMIT_WINDOW_MS,
    },
    "Rate limiting enabled",
  );
};

export default fp(rateLimitPlugin, {
  name: "rate-limit",
  fastify: "5.x",
  dependencies: ["auth"], // Ensure auth plugin is loaded first for user info
});
