/**
 * NetNynja Enterprise - Gateway Rate Limiting Plugin
 */

import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { config } from '../config';
import { redis } from '../redis';

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    redis,
    keyGenerator: (request) => {
      // Use user ID if authenticated, otherwise use IP
      if (request.user) {
        return `user:${request.user.userId}`;
      }
      return request.ip;
    },
    errorResponseBuilder: (request, context) => ({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
        retryAfter: context.ttl,
      },
    }),
  });
};

export default fp(rateLimitPlugin, {
  name: 'rate-limit',
  fastify: '4.x',
});
