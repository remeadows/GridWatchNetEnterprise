/**
 * GridWatch NetEnterprise - Gateway Auth Plugin
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import {
  configureAuth,
  verifyAccessToken,
  type JWTPayload,
} from "@gridwatch/shared-auth";
import { UnauthorizedError, ForbiddenError } from "@gridwatch/shared-auth";
import type { UserRole } from "@gridwatch/shared-types";
import { config } from "../config";

// Extend Fastify types
declare module "fastify" {
  interface FastifyRequest {
    user?: JWTPayload;
  }
  interface FastifyInstance {
    requireAuth: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
    requireRole: (
      ...roles: UserRole[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AuthPluginOptions {
  excludePaths?: string[];
}

const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (
  fastify,
  options,
) => {
  const { excludePaths = [] } = options;

  // Configure shared-auth
  configureAuth({
    jwtSecret: config.JWT_SECRET,
    jwtPublicKey: config.JWT_PUBLIC_KEY,
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
    accessTokenExpiry: "15m",
    refreshTokenExpiry: "7d",
  });

  // Decorate request with user
  fastify.decorateRequest("user", undefined);

  // Decorate fastify with auth helpers
  fastify.decorate(
    "requireAuth",
    async function requireAuthHandler(
      request: FastifyRequest,
      _reply: FastifyReply,
    ): Promise<void> {
      if (!request.user) {
        throw new UnauthorizedError("Authentication required");
      }
    },
  );

  fastify.decorate(
    "requireRole",
    function requireRoleFactory(...allowedRoles: UserRole[]) {
      return async function checkRole(
        request: FastifyRequest,
        _reply: FastifyReply,
      ): Promise<void> {
        if (!request.user) {
          throw new UnauthorizedError("Authentication required");
        }
        if (!allowedRoles.includes(request.user.role)) {
          throw new ForbiddenError(
            `Access denied. Required roles: ${allowedRoles.join(", ")}`,
          );
        }
      };
    },
  );

  // Global auth hook - attempts to authenticate but doesn't require it
  fastify.addHook("onRequest", async (request: FastifyRequest) => {
    // Skip auth for excluded paths
    const path = request.url.split("?")[0] ?? "";
    if (excludePaths.some((pattern) => path.startsWith(pattern))) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return;
    }

    try {
      const token = authHeader.slice(7);
      const payload = await verifyAccessToken(token);
      request.user = payload;
    } catch {
      // Silently ignore - routes requiring auth will check request.user
    }
  });
};

export default fp(authPlugin, {
  name: "auth",
  fastify: "5.x",
});

// ============================================
// Route-level Auth Middleware
// ============================================

/**
 * Require authentication middleware
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.user) {
    throw new UnauthorizedError("Authentication required");
  }
}

/**
 * Require specific role(s) middleware factory
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async function checkRole(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.user) {
      throw new UnauthorizedError("Authentication required");
    }

    if (!allowedRoles.includes(request.user.role)) {
      throw new ForbiddenError(
        `Access denied. Required roles: ${allowedRoles.join(", ")}`,
      );
    }
  };
}

/**
 * Require admin role
 */
export const requireAdmin = requireRole("admin");

/**
 * Require operator or admin role
 */
export const requireOperator = requireRole("admin", "operator");

/**
 * Get current user or throw
 */
export function getCurrentUser(request: FastifyRequest): JWTPayload {
  if (!request.user) {
    throw new UnauthorizedError("Authentication required");
  }
  return request.user;
}
