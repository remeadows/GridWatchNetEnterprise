/**
 * NetNynja Enterprise - Prometheus Metrics Plugin
 *
 * Exposes metrics in Prometheus format for VictoriaMetrics to scrape.
 * All metrics use the 'netnynja_' prefix for easy identification.
 */

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import * as client from "prom-client";
import { config } from "../config";
import { logger } from "../logger";

// Create a custom registry
const register = new client.Registry();

// Add default labels
register.setDefaultLabels({
  app: "netnynja",
  service: "gateway",
  env: config.NODE_ENV,
});

// Collect default Node.js metrics
client.collectDefaultMetrics({
  register,
  prefix: "netnynja_nodejs_",
});

// ===========================================
// HTTP Request Metrics
// ===========================================

const httpRequestsTotal = new client.Counter({
  name: "netnynja_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: "netnynja_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpRequestSizeBytes = new client.Histogram({
  name: "netnynja_http_request_size_bytes",
  help: "HTTP request size in bytes",
  labelNames: ["method", "route"],
  buckets: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000],
  registers: [register],
});

const httpResponseSizeBytes = new client.Histogram({
  name: "netnynja_http_response_size_bytes",
  help: "HTTP response size in bytes",
  labelNames: ["method", "route"],
  buckets: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000],
  registers: [register],
});

const activeConnections = new client.Gauge({
  name: "netnynja_active_connections",
  help: "Number of active connections",
  registers: [register],
});

// ===========================================
// Authentication Metrics
// ===========================================

const authAttemptsTotal = new client.Counter({
  name: "netnynja_auth_attempts_total",
  help: "Total number of authentication attempts",
  labelNames: ["status", "method"],
  registers: [register],
});

const activeSessionsGauge = new client.Gauge({
  name: "netnynja_active_sessions",
  help: "Number of active user sessions",
  labelNames: ["role"],
  registers: [register],
});

// ===========================================
// Rate Limiting Metrics
// ===========================================

const rateLimitExceededTotal = new client.Counter({
  name: "netnynja_rate_limit_exceeded_total",
  help: "Total number of rate limit exceeded events",
  labelNames: ["route", "user_role"],
  registers: [register],
});

// ===========================================
// IPAM Metrics
// ===========================================

const ipamNetworksTotal = new client.Gauge({
  name: "netnynja_ipam_networks_total",
  help: "Total number of networks",
  registers: [register],
});

const ipamSubnetsTotal = new client.Gauge({
  name: "netnynja_ipam_subnets_total",
  help: "Total number of subnets",
  registers: [register],
});

const ipamAddressesTotal = new client.Gauge({
  name: "netnynja_ipam_addresses_total",
  help: "Total number of IP addresses",
  registers: [register],
});

const ipamAddressesAllocated = new client.Gauge({
  name: "netnynja_ipam_addresses_allocated",
  help: "Number of allocated IP addresses",
  registers: [register],
});

const ipamAddressesAvailable = new client.Gauge({
  name: "netnynja_ipam_addresses_available",
  help: "Number of available IP addresses",
  registers: [register],
});

const ipamSubnetAllocated = new client.Gauge({
  name: "netnynja_ipam_subnet_allocated",
  help: "Number of allocated addresses per subnet",
  labelNames: ["subnet", "network"],
  registers: [register],
});

const ipamSubnetTotal = new client.Gauge({
  name: "netnynja_ipam_subnet_total",
  help: "Total addresses per subnet",
  labelNames: ["subnet", "network"],
  registers: [register],
});

const ipamAllocationsTotal = new client.Counter({
  name: "netnynja_ipam_allocations_total",
  help: "Total number of IP allocations",
  registers: [register],
});

const ipamReleasesTotal = new client.Counter({
  name: "netnynja_ipam_releases_total",
  help: "Total number of IP releases",
  registers: [register],
});

const ipamScansTotal = new client.Counter({
  name: "netnynja_ipam_scans_total",
  help: "Total number of network scans",
  labelNames: ["status"],
  registers: [register],
});

const ipamScanDurationSeconds = new client.Histogram({
  name: "netnynja_ipam_scan_duration_seconds",
  help: "Duration of network scans in seconds",
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [register],
});

const ipamHostsDiscovered = new client.Counter({
  name: "netnynja_ipam_hosts_discovered",
  help: "Number of hosts discovered during scans",
  registers: [register],
});

const ipamActiveScans = new client.Gauge({
  name: "netnynja_ipam_active_scans",
  help: "Number of currently active scans",
  registers: [register],
});

// ===========================================
// Database Connection Metrics
// ===========================================

const dbPoolActiveConnections = new client.Gauge({
  name: "netnynja_db_pool_active_connections",
  help: "Number of active database connections",
  registers: [register],
});

const dbPoolIdleConnections = new client.Gauge({
  name: "netnynja_db_pool_idle_connections",
  help: "Number of idle database connections",
  registers: [register],
});

const dbQueryDurationSeconds = new client.Histogram({
  name: "netnynja_db_query_duration_seconds",
  help: "Database query duration in seconds",
  labelNames: ["operation"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

// ===========================================
// Redis Metrics (for rate limiting)
// ===========================================

const redisOperationsTotal = new client.Counter({
  name: "netnynja_redis_operations_total",
  help: "Total number of Redis operations",
  labelNames: ["operation"],
  registers: [register],
});

const redisOperationDurationSeconds = new client.Histogram({
  name: "netnynja_redis_operation_duration_seconds",
  help: "Redis operation duration in seconds",
  labelNames: ["operation"],
  buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1],
  registers: [register],
});

// ===========================================
// Exported Metrics Functions
// ===========================================

export const metrics = {
  // HTTP
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpRequestSizeBytes,
  httpResponseSizeBytes,
  activeConnections,

  // Auth
  authAttemptsTotal,
  activeSessionsGauge,

  // Rate Limiting
  rateLimitExceededTotal,

  // IPAM
  ipamNetworksTotal,
  ipamSubnetsTotal,
  ipamAddressesTotal,
  ipamAddressesAllocated,
  ipamAddressesAvailable,
  ipamSubnetAllocated,
  ipamSubnetTotal,
  ipamAllocationsTotal,
  ipamReleasesTotal,
  ipamScansTotal,
  ipamScanDurationSeconds,
  ipamHostsDiscovered,
  ipamActiveScans,

  // Database
  dbPoolActiveConnections,
  dbPoolIdleConnections,
  dbQueryDurationSeconds,

  // Redis
  redisOperationsTotal,
  redisOperationDurationSeconds,
};

// ===========================================
// Plugin Implementation
// ===========================================

const metricsPlugin: FastifyPluginAsync = async (fastify) => {
  // Track active connections
  let connectionCount = 0;

  fastify.addHook("onRequest", async () => {
    connectionCount++;
    activeConnections.set(connectionCount);
  });

  fastify.addHook(
    "onResponse",
    async (request: FastifyRequest, reply: FastifyReply) => {
      connectionCount--;
      activeConnections.set(connectionCount);

      // Record metrics
      const route = request.routeOptions.url || request.url;
      const method = request.method;
      const statusCode = reply.statusCode.toString();
      const duration = reply.elapsedTime / 1000; // Convert to seconds

      httpRequestsTotal.inc({
        method,
        route,
        status_code: statusCode,
      });

      httpRequestDurationSeconds.observe(
        { method, route, status_code: statusCode },
        duration,
      );

      // Request size
      const requestSize = request.headers["content-length"];
      if (requestSize) {
        httpRequestSizeBytes.observe(
          { method, route },
          parseInt(requestSize, 10),
        );
      }

      // Response size (approximate from content-length header)
      const responseSize = reply.getHeader("content-length");
      if (responseSize) {
        httpResponseSizeBytes.observe(
          { method, route },
          typeof responseSize === "number"
            ? responseSize
            : parseInt(responseSize as string, 10),
        );
      }
    },
  );

  // Helper to check if IP is in CIDR range
  const isIpInRange = (ip: string, cidr: string): boolean => {
    if (!cidr.includes("/")) {
      return ip === cidr;
    }
    const parts = cidr.split("/");
    const range = parts[0] ?? "";
    const bits = parts[1] ?? "32";
    const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);
    const ipNum = ip
      .split(".")
      .reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0);
    const rangeNum = range
      .split(".")
      .reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0);
    return (ipNum & mask) === (rangeNum & mask);
  };

  // Check if client IP is allowed
  const isIpAllowed = (clientIp: string): boolean => {
    if (!config.METRICS_AUTH_ENABLED) return true;
    const allowedIps = config.METRICS_ALLOWED_IPS;
    if (allowedIps.length === 0) return true;

    // Handle IPv6 localhost
    const normalizedIp =
      clientIp === "::ffff:127.0.0.1" ? "127.0.0.1" : clientIp;

    for (const allowed of allowedIps) {
      if (allowed === normalizedIp) return true;
      if (allowed.includes("/") && isIpInRange(normalizedIp, allowed))
        return true;
    }
    return false;
  };

  // Expose /metrics endpoint with IP allowlist
  fastify.get("/metrics", async (request, reply) => {
    const clientIp = request.ip;

    if (!isIpAllowed(clientIp)) {
      logger.warn({ clientIp }, "Metrics access denied - IP not in allowlist");
      return reply.code(403).send("Forbidden");
    }

    try {
      const metricsData = await register.metrics();
      reply.header("Content-Type", register.contentType);
      return metricsData;
    } catch (err) {
      logger.error({ err }, "Failed to generate metrics");
      return reply.code(500).send("Failed to generate metrics");
    }
  });

  logger.info(
    { authEnabled: config.METRICS_AUTH_ENABLED },
    "Prometheus metrics endpoint enabled at /metrics",
  );
};

export default fp(metricsPlugin, {
  name: "netnynja-metrics",
  fastify: "4.x",
});
