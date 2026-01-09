/**
 * NetNynja Enterprise - Auth Service Redis Client
 */

import Redis from "ioredis";
import { config } from "./config";
import { logger } from "./logger";

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 3) {
      logger.error("Redis connection failed after 3 retries");
      return null;
    }
    return Math.min(times * 200, 2000);
  },
  lazyConnect: true,
});

redis.on("connect", () => {
  logger.info("Connected to Redis");
});

redis.on("error", (err) => {
  logger.error({ err }, "Redis connection error");
});

redis.on("close", () => {
  logger.warn("Redis connection closed");
});

// ============================================
// Session Management
// ============================================

const SESSION_PREFIX = "session:";
const REFRESH_TOKEN_PREFIX = "refresh:";

/**
 * Store a refresh token hash for a user
 */
export async function storeRefreshToken(
  userId: string,
  tokenHash: string,
  expirySeconds: number,
): Promise<void> {
  const key = `${REFRESH_TOKEN_PREFIX}${userId}:${tokenHash}`;
  await redis.setex(key, expirySeconds, "1");
  logger.debug({ userId }, "Stored refresh token");
}

/**
 * Check if a refresh token is valid (not revoked)
 */
export async function isRefreshTokenValid(
  userId: string,
  tokenHash: string,
): Promise<boolean> {
  const key = `${REFRESH_TOKEN_PREFIX}${userId}:${tokenHash}`;
  const exists = await redis.exists(key);
  return exists === 1;
}

/**
 * Revoke a specific refresh token
 */
export async function revokeRefreshToken(
  userId: string,
  tokenHash: string,
): Promise<void> {
  const key = `${REFRESH_TOKEN_PREFIX}${userId}:${tokenHash}`;
  await redis.del(key);
  logger.debug({ userId }, "Revoked refresh token");
}

/**
 * Revoke all refresh tokens for a user (logout all devices)
 */
export async function revokeAllRefreshTokens(userId: string): Promise<number> {
  const pattern = `${REFRESH_TOKEN_PREFIX}${userId}:*`;
  const keys = await redis.keys(pattern);

  if (keys.length === 0) {
    return 0;
  }

  const deleted = await redis.del(...keys);
  logger.info({ userId, count: deleted }, "Revoked all refresh tokens");
  return deleted;
}

// ============================================
// Session Data
// ============================================

export interface SessionData {
  userId: string;
  username: string;
  role: string;
  loginAt: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Store session data
 */
export async function storeSession(
  sessionId: string,
  data: SessionData,
  expirySeconds: number,
): Promise<void> {
  const key = `${SESSION_PREFIX}${sessionId}`;
  await redis.setex(key, expirySeconds, JSON.stringify(data));
}

/**
 * Get session data
 */
export async function getSession(
  sessionId: string,
): Promise<SessionData | null> {
  const key = `${SESSION_PREFIX}${sessionId}`;
  const data = await redis.get(key);

  if (!data) {
    return null;
  }

  return JSON.parse(data) as SessionData;
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const key = `${SESSION_PREFIX}${sessionId}`;
  await redis.del(key);
}

// ============================================
// Rate Limiting
// ============================================

const RATE_LIMIT_PREFIX = "ratelimit:";

/**
 * Check rate limit for an IP/action combination
 */
export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const redisKey = `${RATE_LIMIT_PREFIX}${key}`;

  const multi = redis.multi();
  multi.incr(redisKey);
  multi.ttl(redisKey);

  const results = await multi.exec();

  if (!results || !results[0] || !results[1]) {
    return {
      allowed: true,
      remaining: maxAttempts - 1,
      resetIn: windowSeconds,
    };
  }

  const count = results[0][1] as number;
  let ttl = results[1][1] as number;

  // Set expiry on first request
  if (ttl === -1) {
    await redis.expire(redisKey, windowSeconds);
    ttl = windowSeconds;
  }

  const allowed = count <= maxAttempts;
  const remaining = Math.max(0, maxAttempts - count);

  return { allowed, remaining, resetIn: ttl };
}

// ============================================
// Failed Login Tracking
// ============================================

const FAILED_LOGIN_PREFIX = "failedlogin:";
const LOCKOUT_PREFIX = "lockout:";

/**
 * Record a failed login attempt
 */
export async function recordFailedLogin(
  username: string,
  maxAttempts: number,
  lockoutMinutes: number,
): Promise<{ locked: boolean; attempts: number }> {
  const key = `${FAILED_LOGIN_PREFIX}${username}`;
  const lockoutKey = `${LOCKOUT_PREFIX}${username}`;

  // Check if already locked out
  const isLocked = await redis.exists(lockoutKey);
  if (isLocked) {
    const ttl = await redis.ttl(lockoutKey);
    return { locked: true, attempts: maxAttempts };
  }

  // Increment failed attempts
  const attempts = await redis.incr(key);

  // Set expiry on first attempt (attempts reset after lockout period)
  if (attempts === 1) {
    await redis.expire(key, lockoutMinutes * 60);
  }

  // Lock account if max attempts exceeded
  if (attempts >= maxAttempts) {
    await redis.setex(lockoutKey, lockoutMinutes * 60, "1");
    await redis.del(key);
    logger.warn(
      { username, attempts },
      "Account locked due to failed login attempts",
    );
    return { locked: true, attempts };
  }

  return { locked: false, attempts };
}

/**
 * Clear failed login attempts on successful login
 */
export async function clearFailedLogins(username: string): Promise<void> {
  const key = `${FAILED_LOGIN_PREFIX}${username}`;
  await redis.del(key);
}

/**
 * Check if an account is locked
 */
export async function isAccountLocked(username: string): Promise<boolean> {
  const lockoutKey = `${LOCKOUT_PREFIX}${username}`;
  return (await redis.exists(lockoutKey)) === 1;
}

/**
 * Get lockout TTL
 */
export async function getLockoutTTL(username: string): Promise<number> {
  const lockoutKey = `${LOCKOUT_PREFIX}${username}`;
  return redis.ttl(lockoutKey);
}

// ============================================
// Health Check
// ============================================

export async function checkHealth(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Gracefully close Redis connection
 */
export async function closeRedis(): Promise<void> {
  await redis.quit();
  logger.info("Redis connection closed");
}
