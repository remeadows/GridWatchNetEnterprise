/**
 * GridWatch NetEnterprise - Auth Service Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  configureAuth,
  generateTokens,
  verifyPassword,
  hashToken,
  verifyRefreshToken,
  verifyAccessToken,
} from "@gridwatch/shared-auth";
import {
  LoginSchema,
  type ApiResponse,
  type AuthTokens,
  type User,
} from "@gridwatch/shared-types";
import { config } from "./config";
import * as users from "./users";
import * as redis from "./redis";
import * as audit from "./audit";
import { logger } from "./logger";

// Configure shared-auth with our config
configureAuth({
  jwtSecret: config.JWT_SECRET,
  jwtPrivateKey: config.JWT_PRIVATE_KEY,
  jwtPublicKey: config.JWT_PUBLIC_KEY,
  accessTokenExpiry: config.JWT_ACCESS_EXPIRY,
  refreshTokenExpiry: config.JWT_REFRESH_EXPIRY,
  issuer: config.JWT_ISSUER,
  audience: config.JWT_AUDIENCE,
});

// ============================================
// Request/Response Schemas
// ============================================

const RefreshSchema = z.object({
  refreshToken: z.string().min(1).optional(), // Optional - can come from cookie
});

const LogoutSchema = z.object({
  refreshToken: z.string().optional(),
  allDevices: z.boolean().optional().default(false),
});

// ============================================
// Route Helpers
// ============================================

function getClientInfo(request: FastifyRequest): {
  ipAddress: string;
  userAgent: string;
} {
  const forwarded = request.headers["x-forwarded-for"];
  const forwardedIp =
    typeof forwarded === "string" ? forwarded : forwarded?.[0];
  const ipAddress = request.ip || forwardedIp || "unknown";
  const userAgent = request.headers["user-agent"] || "unknown";
  return { ipAddress, userAgent };
}

function parseRefreshTokenExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match || !match[1] || !match[2]) return 604800; // default 7 days

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 3600;
    case "d":
      return value * 86400;
    default:
      return 604800;
  }
}

// ============================================
// Routes
// ============================================

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Health check
  fastify.get("/health", async (): Promise<ApiResponse<{ status: string }>> => {
    return {
      success: true,
      data: { status: "healthy" },
    };
  });

  // ============================================
  // POST /login
  // ============================================
  fastify.post<{ Body: z.infer<typeof LoginSchema> }>(
    "/login",
    async (
      request,
      reply,
    ): Promise<ApiResponse<{ tokens: AuthTokens; user: User }>> => {
      const { ipAddress, userAgent } = getClientInfo(request);

      // Validate input
      const parseResult = LoginSchema.safeParse(request.body);
      if (!parseResult.success) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: parseResult.error.flatten(),
          },
        };
      }

      const { username, password } = parseResult.data;

      // Check rate limiting (by IP)
      const rateLimit = await redis.checkRateLimit(
        `login:${ipAddress}`,
        config.RATE_LIMIT_MAX,
        Math.floor(config.RATE_LIMIT_WINDOW_MS / 1000),
      );

      if (!rateLimit.allowed) {
        reply.status(429);
        reply.header("Retry-After", rateLimit.resetIn.toString());
        return {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many login attempts. Please try again later.",
          },
        };
      }

      // Check if account is locked (in Redis for performance)
      if (await redis.isAccountLocked(username)) {
        const ttl = await redis.getLockoutTTL(username);
        await audit.logLoginFailed(
          username,
          "Account locked",
          ipAddress,
          userAgent,
        );

        reply.status(403);
        return {
          success: false,
          error: {
            code: "ACCOUNT_LOCKED",
            message: `Account is temporarily locked. Try again in ${Math.ceil(ttl / 60)} minutes.`,
          },
        };
      }

      // Find user
      const user = await users.findByUsername(username);
      if (!user) {
        await audit.logLoginFailed(
          username,
          "User not found",
          ipAddress,
          userAgent,
        );
        reply.status(401);
        return {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid username or password",
          },
        };
      }

      // Check if user is active
      if (!user.is_active) {
        await audit.logLoginFailed(
          username,
          "Account inactive",
          ipAddress,
          userAgent,
        );
        reply.status(401);
        return {
          success: false,
          error: {
            code: "ACCOUNT_INACTIVE",
            message: "Account is inactive",
          },
        };
      }

      // Verify password
      const passwordValid = await verifyPassword(user.password_hash, password);
      if (!passwordValid) {
        // Record failed attempt
        const { locked, attempts } = await redis.recordFailedLogin(
          username,
          config.MAX_LOGIN_ATTEMPTS,
          config.LOCKOUT_DURATION_MINUTES,
        );

        if (locked) {
          await audit.logAccountLocked(username, attempts, ipAddress);
        }

        await audit.logLoginFailed(
          username,
          "Invalid password",
          ipAddress,
          userAgent,
        );
        reply.status(401);
        return {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid username or password",
          },
        };
      }

      // Clear failed login attempts
      await redis.clearFailedLogins(username);

      // Generate tokens
      const tokens = await generateTokens(
        user.id,
        user.username,
        user.email,
        user.role,
      );

      // Store refresh token hash in Redis
      const refreshTokenHash = await hashToken(tokens.refreshToken);
      const refreshExpiry = parseRefreshTokenExpiry(config.JWT_REFRESH_EXPIRY);
      await redis.storeRefreshToken(user.id, refreshTokenHash, refreshExpiry);

      // Update last login
      await users.updateLastLogin(user.id);

      // Audit log
      await audit.logLoginSuccess(user.id, user.username, ipAddress, userAgent);

      logger.info(
        { userId: user.id, username: user.username },
        "User logged in",
      );

      // Set refresh token as HttpOnly cookie for XSS protection
      const refreshExpirySecs = parseRefreshTokenExpiry(
        config.JWT_REFRESH_EXPIRY,
      );
      reply.setCookie("refreshToken", tokens.refreshToken, {
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: refreshExpirySecs,
      });

      return {
        success: true,
        data: {
          tokens,
          user: users.toApiUser(user),
        },
      };
    },
  );

  // ============================================
  // POST /refresh
  // ============================================
  fastify.post<{ Body: z.infer<typeof RefreshSchema> }>(
    "/refresh",
    async (request, reply): Promise<ApiResponse<{ tokens: AuthTokens }>> => {
      const { ipAddress, userAgent } = getClientInfo(request);

      // Validate input
      const parseResult = RefreshSchema.safeParse(request.body);
      if (!parseResult.success) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
          },
        };
      }

      // Get refresh token from body or cookie (cookie takes precedence for security)
      const cookieToken = request.cookies?.refreshToken;
      const refreshToken = cookieToken || parseResult.data.refreshToken;

      if (!refreshToken) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "MISSING_TOKEN",
            message: "Refresh token required (via cookie or body)",
          },
        };
      }

      try {
        // Verify refresh token signature
        const { sub: userId } = await verifyRefreshToken(refreshToken);

        // Check if token is still valid in Redis (not revoked)
        const tokenHash = await hashToken(refreshToken);
        const isValid = await redis.isRefreshTokenValid(userId, tokenHash);

        if (!isValid) {
          return reply.status(401).send({
            success: false,
            error: {
              code: "TOKEN_REVOKED",
              message: "Refresh token has been revoked",
            },
          });
        }

        // Get user
        const user = await users.findById(userId);
        if (!user || !user.is_active) {
          return reply.status(401).send({
            success: false,
            error: {
              code: "USER_NOT_FOUND",
              message: "User not found or inactive",
            },
          });
        }

        // Revoke old refresh token
        await redis.revokeRefreshToken(userId, tokenHash);

        // Generate new tokens
        const tokens = await generateTokens(
          user.id,
          user.username,
          user.email,
          user.role,
        );

        // Store new refresh token hash
        const newTokenHash = await hashToken(tokens.refreshToken);
        const refreshExpiry = parseRefreshTokenExpiry(
          config.JWT_REFRESH_EXPIRY,
        );
        await redis.storeRefreshToken(user.id, newTokenHash, refreshExpiry);

        // Audit log
        await audit.logTokenRefresh(user.id, ipAddress, userAgent);

        logger.debug({ userId: user.id }, "Token refreshed");

        // Set new refresh token as HttpOnly cookie
        reply.setCookie("refreshToken", tokens.refreshToken, {
          httpOnly: true,
          secure: config.NODE_ENV === "production",
          sameSite: "strict",
          path: "/",
          maxAge: refreshExpiry,
        });

        return {
          success: true,
          data: { tokens },
        };
      } catch (error) {
        logger.warn({ error }, "Token refresh failed");
        return reply.status(401).send({
          success: false,
          error: {
            code: "INVALID_TOKEN",
            message: "Invalid or expired refresh token",
          },
        });
      }
    },
  );

  // ============================================
  // POST /logout
  // ============================================
  fastify.post<{ Body: z.infer<typeof LogoutSchema> }>(
    "/logout",
    async (request, reply): Promise<ApiResponse<{ message: string }>> => {
      const { ipAddress, userAgent } = getClientInfo(request);

      // Get user from access token
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        reply.status(401);
        return {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "No authorization header",
          },
        };
      }

      const accessToken = authHeader.slice(7);

      try {
        const payload = await verifyAccessToken(accessToken);
        const userId = payload.sub;

        const body = LogoutSchema.parse(request.body || {});

        if (body.allDevices) {
          // Revoke all refresh tokens
          const count = await redis.revokeAllRefreshTokens(userId);
          await audit.logLogoutAll(userId, count, ipAddress, userAgent);

          logger.info(
            { userId, sessionCount: count },
            "User logged out from all devices",
          );

          return {
            success: true,
            data: { message: `Logged out from ${count} device(s)` },
          };
        }

        // Revoke single refresh token if provided (from body or cookie)
        const cookieToken = request.cookies?.refreshToken;
        const tokenToRevoke = body.refreshToken || cookieToken;
        if (tokenToRevoke) {
          const tokenHash = await hashToken(tokenToRevoke);
          await redis.revokeRefreshToken(userId, tokenHash);
        }

        // Clear refresh token cookie
        reply.clearCookie("refreshToken", {
          httpOnly: true,
          secure: config.NODE_ENV === "production",
          sameSite: "strict",
          path: "/",
        });

        await audit.logLogout(userId, ipAddress, userAgent);

        logger.info({ userId }, "User logged out");

        return {
          success: true,
          data: { message: "Logged out successfully" },
        };
      } catch (error) {
        // Even with invalid token, we still log out - clear cookie anyway
        reply.clearCookie("refreshToken", {
          httpOnly: true,
          secure: config.NODE_ENV === "production",
          sameSite: "strict",
          path: "/",
        });
        logger.warn({ error }, "Logout with invalid token");
        return {
          success: true,
          data: { message: "Logged out" },
        };
      }
    },
  );

  // ============================================
  // GET /verify
  // ============================================
  fastify.get(
    "/verify",
    async (
      request,
      reply,
    ): Promise<ApiResponse<{ valid: boolean; user?: User }>> => {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return {
          success: true,
          data: { valid: false },
        };
      }

      const accessToken = authHeader.slice(7);

      try {
        const payload = await verifyAccessToken(accessToken);

        // Optionally fetch full user data
        const user = await users.findById(payload.sub);
        if (!user || !user.is_active) {
          return {
            success: true,
            data: { valid: false },
          };
        }

        return {
          success: true,
          data: {
            valid: true,
            user: users.toApiUser(user),
          },
        };
      } catch (error) {
        return {
          success: true,
          data: { valid: false },
        };
      }
    },
  );

  // ============================================
  // GET /me
  // ============================================
  fastify.get("/me", async (request, reply): Promise<ApiResponse<User>> => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      reply.status(401);
      return {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "No authorization header",
        },
      };
    }

    const accessToken = authHeader.slice(7);

    try {
      const payload = await verifyAccessToken(accessToken);
      const user = await users.findById(payload.sub);

      if (!user) {
        reply.status(404);
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "User not found",
          },
        };
      }

      return {
        success: true,
        data: users.toApiUser(user),
      };
    } catch (error) {
      reply.status(401);
      return {
        success: false,
        error: {
          code: "INVALID_TOKEN",
          message: "Invalid or expired token",
        },
      };
    }
  });
}
