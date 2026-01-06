/**
 * NetNynja Enterprise - Auth Service Logger
 */

import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino({
  name: 'auth-service',
  level: process.env.LOG_LEVEL || 'info',
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    service: 'auth-service',
    version: process.env.npm_package_version || '0.1.0',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
});
