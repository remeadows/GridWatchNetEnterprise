/**
 * NetNynja Enterprise - Gateway Swagger/OpenAPI Plugin
 */

import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from '../config';

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'NetNynja Enterprise API',
        description: 'Unified Network Management Platform API',
        version: '0.1.0',
        contact: {
          name: 'NetNynja Team',
          email: 'support@netnynja.local',
        },
        license: {
          name: 'Proprietary',
        },
      },
      servers: [
        {
          url: `http://localhost:${config.PORT}`,
          description: 'Development server',
        },
      ],
      tags: [
        { name: 'health', description: 'Health check endpoints' },
        { name: 'auth', description: 'Authentication endpoints' },
        { name: 'ipam', description: 'IP Address Management' },
        { name: 'npm', description: 'Network Performance Monitoring' },
        { name: 'stig', description: 'STIG Manager' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT access token',
          },
        },
        schemas: {
          Error: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string', example: 'VALIDATION_ERROR' },
                  message: { type: 'string', example: 'Invalid request' },
                  details: { type: 'object' },
                },
              },
            },
          },
          User: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              username: { type: 'string' },
              email: { type: 'string', format: 'email' },
              role: { type: 'string', enum: ['admin', 'operator', 'viewer'] },
              isActive: { type: 'boolean' },
              lastLogin: { type: 'string', format: 'date-time' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          AuthTokens: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              expiresIn: { type: 'number', example: 900 },
            },
          },
          Pagination: {
            type: 'object',
            properties: {
              page: { type: 'number', example: 1 },
              limit: { type: 'number', example: 20 },
              total: { type: 'number', example: 100 },
              totalPages: { type: 'number', example: 5 },
            },
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      displayRequestDuration: true,
      filter: true,
      syntaxHighlight: {
        theme: 'monokai',
      },
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });
};

export default fp(swaggerPlugin, {
  name: 'swagger',
  fastify: '4.x',
});
