/**
 * NetNynja Enterprise - Fastify Authentication Middleware
 */

import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import type { JWTPayload, UserRole } from '@netnynja/shared-types';
import { verifyAccessToken } from './index';
import { UnauthorizedError, ForbiddenError, InvalidTokenError } from './errors';

// Extend Fastify types
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

// ============================================
// Middleware Factories
// ============================================

/**
 * Create authentication middleware that verifies JWT tokens
 */
export function createAuthMiddleware() {
  return async function authenticate(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedError('No authorization header');
    }

    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedError('Invalid authorization header format');
    }

    try {
      const payload = await verifyAccessToken(token);
      request.user = payload;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('expired')) {
          throw new InvalidTokenError('Token has expired');
        }
      }
      throw new InvalidTokenError('Invalid or malformed token');
    }
  };
}

/**
 * Create role-based access control middleware
 */
export function createRoleMiddleware(...allowedRoles: UserRole[]) {
  return async function checkRole(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!allowedRoles.includes(request.user.role)) {
      throw new ForbiddenError(
        `Access denied. Required roles: ${allowedRoles.join(', ')}`
      );
    }
  };
}

/**
 * Require admin role
 */
export const requireAdmin = createRoleMiddleware('admin');

/**
 * Require operator or admin role
 */
export const requireOperator = createRoleMiddleware('admin', 'operator');

/**
 * Require any authenticated user
 */
export const requireAuth = createAuthMiddleware();

// ============================================
// Fastify Plugin
// ============================================

export interface AuthPluginOptions {
  exclude?: string[]; // Routes to exclude from auth
}

/**
 * Fastify plugin that adds authentication to all routes
 */
export async function authPlugin(
  fastify: FastifyInstance,
  options: AuthPluginOptions = {}
): Promise<void> {
  const { exclude = [] } = options;

  // Add user property to request
  fastify.decorateRequest('user', null);

  // Global auth hook
  fastify.addHook('onRequest', async (request, _reply) => {
    // Skip auth for excluded routes
    const path = request.routeOptions?.url || request.url;
    if (exclude.some((pattern) => path.startsWith(pattern))) {
      return;
    }

    // Skip if no auth header (let individual routes decide)
    if (!request.headers.authorization) {
      return;
    }

    try {
      const authHeader = request.headers.authorization;
      const [scheme, token] = authHeader.split(' ');

      if (scheme === 'Bearer' && token) {
        const payload = await verifyAccessToken(token);
        request.user = payload;
      }
    } catch {
      // Silently ignore - routes requiring auth will check request.user
    }
  });
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get the current user from a request
 * @throws UnauthorizedError if no user is authenticated
 */
export function getCurrentUser(request: FastifyRequest): JWTPayload {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.user;
}

/**
 * Check if the current user has a specific role
 */
export function hasRole(request: FastifyRequest, role: UserRole): boolean {
  return request.user?.role === role;
}

/**
 * Check if the current user is an admin
 */
export function isAdmin(request: FastifyRequest): boolean {
  return hasRole(request, 'admin');
}

/**
 * Check if the current user can perform an action on a resource
 * (Admins can do anything, others can only modify their own resources)
 */
export function canModifyResource(
  request: FastifyRequest,
  resourceOwnerId: string
): boolean {
  if (!request.user) return false;
  if (request.user.role === 'admin') return true;
  return request.user.sub === resourceOwnerId;
}
