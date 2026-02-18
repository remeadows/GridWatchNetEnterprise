/**
 * GridWatch NetEnterprise - API Gateway Logger
 *
 * Supports multiple transports:
 * - Development: pino-pretty for colored console output
 * - Production: pino-loki for centralized log aggregation
 */

import pino from "pino";
import type { TransportTargetOptions } from "pino";

const isDevelopment = process.env.NODE_ENV !== "production";
const lokiUrl = process.env.LOKI_URL || "http://loki:3100";

/**
 * Build transport configuration based on environment
 */
function buildTransport():
  | pino.TransportSingleOptions
  | pino.TransportMultiOptions
  | undefined {
  if (isDevelopment) {
    // Development: pretty console output
    return {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    };
  }

  // Production: send logs to Loki
  const targets: TransportTargetOptions[] = [
    {
      target: "pino-loki",
      options: {
        host: lokiUrl,
        batching: true,
        interval: 5, // seconds
        labels: {
          application: "GridWatch-gateway",
          environment: process.env.NODE_ENV || "production",
        },
      },
      level: "info",
    },
  ];

  // Also output to stdout in production for container logs
  targets.push({
    target: "pino/file",
    options: { destination: 1 }, // stdout
    level: "info",
  });

  return { targets };
}

export const logger = pino({
  name: "gateway",
  level: process.env.LOG_LEVEL || "info",
  transport: buildTransport(),
  base: {
    service: "gateway",
    version: process.env.npm_package_version || "0.1.0",
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
});

/**
 * Create a child logger with additional context
 */
export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
