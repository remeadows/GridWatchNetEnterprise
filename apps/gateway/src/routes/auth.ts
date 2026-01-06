/**
 * NetNynja Enterprise - Gateway Auth Routes (Proxy to Auth Service)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../logger';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const authServiceUrl = config.AUTH_SERVICE_URL;

  // Login
  fastify.post('/login', {
    schema: {
      tags: ['Authentication'],
      summary: 'Authenticate user and get tokens',
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
                expiresIn: { type: 'number' },
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    username: { type: 'string' },
                    email: { type: 'string' },
                    role: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const response = await fetch(`${authServiceUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': request.ip,
        'X-Request-Id': request.id,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    reply.status(response.status).send(data);
  });

  // Refresh token
  fastify.post('/refresh', {
    schema: {
      tags: ['Authentication'],
      summary: 'Refresh access token',
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const body = refreshSchema.parse(request.body);

    const response = await fetch(`${authServiceUrl}/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': request.id,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    reply.status(response.status).send(data);
  });

  // Logout
  fastify.post('/logout', {
    schema: {
      tags: ['Authentication'],
      summary: 'Logout and invalidate tokens',
    },
  }, async (request, reply) => {
    const authHeader = request.headers.authorization;

    const response = await fetch(`${authServiceUrl}/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
        'X-Request-Id': request.id,
      },
    });

    const data = await response.json();
    reply.status(response.status).send(data);
  });

  // Get current user
  fastify.get('/me', {
    schema: {
      tags: ['Authentication'],
      summary: 'Get current authenticated user',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    return {
      success: true,
      data: {
        user: request.user,
      },
    };
  });

  // Verify token (internal use)
  fastify.get('/verify', {
    schema: {
      tags: ['Authentication'],
      summary: 'Verify access token',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const authHeader = request.headers.authorization;

    const response = await fetch(`${authServiceUrl}/verify`, {
      method: 'GET',
      headers: {
        ...(authHeader && { Authorization: authHeader }),
        'X-Request-Id': request.id,
      },
    });

    const data = await response.json();
    reply.status(response.status).send(data);
  });
};

export default authRoutes;
