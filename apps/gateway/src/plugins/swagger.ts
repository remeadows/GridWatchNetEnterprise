/**
 * GridWatch NetEnterprise - Gateway Swagger/OpenAPI Plugin
 */

import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { config } from "../config";

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "GridWatch NetEnterprise API",
        description: `
# GridWatch NetEnterprise API

Unified Network Management Platform combining:
- **IPAM** - IP Address Management
- **NPM** - Network Performance Monitoring
- **STIG Manager** - Security Technical Implementation Guide compliance

## Authentication

All API endpoints (except health checks) require JWT authentication.
Use the \`/api/v1/auth/login\` endpoint to obtain tokens.

Include the access token in the \`Authorization\` header:
\`\`\`
Authorization: Bearer <access_token>
\`\`\`

## Rate Limiting

API requests are rate-limited:
- **Default**: 100 requests/minute
- **Auth endpoints**: 10 requests/minute (prevents brute force)
- **Admin users**: 300 requests/minute
- **Operator users**: 200 requests/minute

Rate limit headers are included in responses:
- \`X-RateLimit-Limit\`: Maximum requests allowed
- \`X-RateLimit-Remaining\`: Requests remaining in window
- \`X-RateLimit-Reset\`: Timestamp when limit resets

## Error Handling

All errors follow a consistent format:
\`\`\`json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
\`\`\`

Common error codes:
- \`UNAUTHORIZED\` - Missing or invalid authentication
- \`FORBIDDEN\` - Insufficient permissions
- \`VALIDATION_ERROR\` - Invalid request data
- \`NOT_FOUND\` - Resource not found
- \`RATE_LIMITED\` - Too many requests

## Versioning

API version is included in the URL path: \`/api/v1/...\`
        `.trim(),
        version: "0.2.15",
        contact: {
          name: "WarSignalLabs",
          email: "support@warsignallabs.io",
          url: "https://warsignallabs.io/support",
        },
        license: {
          name: "Proprietary",
          url: "https://warsignallabs.io/license",
        },
        termsOfService: "https://gridwatch.io/terms",
      },
      externalDocs: {
        description: "Full Documentation",
        url: "https://docs.gridwatch.io",
      },
      servers: [
        {
          url: `http://localhost:${config.PORT}`,
          description: "Development server",
        },
        {
          url: "https://api.gridwatch.io",
          description: "Production server",
        },
      ],
      tags: [
        {
          name: "Health",
          description:
            "Health check endpoints for monitoring and orchestration",
          externalDocs: {
            description: "Kubernetes Health Checks",
            url: "https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/",
          },
        },
        {
          name: "Authentication",
          description: "User authentication and token management",
        },
        {
          name: "IPAM - Networks",
          description: "Network management for IP Address Management",
        },
        {
          name: "IPAM - Subnets",
          description: "Subnet management within networks",
        },
        {
          name: "IPAM - Addresses",
          description: "IP address allocation and tracking",
        },
        {
          name: "IPAM - Scanning",
          description: "Network discovery and scanning operations",
        },
        {
          name: "NPM - Devices",
          description: "Network device monitoring and management",
        },
        {
          name: "NPM - Metrics",
          description: "Performance metrics collection and retrieval",
        },
        {
          name: "NPM - Alerts",
          description: "Alert configuration and management",
        },
        {
          name: "STIG - Benchmarks",
          description: "STIG benchmark definitions and management",
        },
        {
          name: "STIG - Assessments",
          description: "Compliance assessment operations",
        },
        {
          name: "STIG - Reports",
          description: "Compliance reporting and export",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "JWT access token obtained from /api/v1/auth/login",
          },
        },
        schemas: {
          // Common Response Schemas
          SuccessResponse: {
            type: "object",
            properties: {
              success: { type: "boolean", example: true },
              data: { type: "object" },
            },
            required: ["success"],
          },
          Error: {
            type: "object",
            properties: {
              success: { type: "boolean", example: false },
              error: {
                type: "object",
                properties: {
                  code: { type: "string", example: "VALIDATION_ERROR" },
                  message: { type: "string", example: "Invalid request" },
                  details: { type: "object" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },

          // User & Auth Schemas
          User: {
            type: "object",
            properties: {
              id: {
                type: "string",
                format: "uuid",
                description: "Unique user identifier",
              },
              username: { type: "string", minLength: 3, maxLength: 50 },
              email: { type: "string", format: "email" },
              role: {
                type: "string",
                enum: ["admin", "operator", "viewer"],
                description: "User role determining permissions",
              },
              isActive: {
                type: "boolean",
                description: "Whether the user account is active",
              },
              lastLogin: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
            },
            required: ["id", "username", "email", "role", "isActive"],
          },
          AuthTokens: {
            type: "object",
            properties: {
              accessToken: {
                type: "string",
                description: "JWT access token for API requests",
              },
              refreshToken: {
                type: "string",
                description: "Token to obtain new access tokens",
              },
              expiresIn: {
                type: "number",
                example: 900,
                description: "Access token TTL in seconds",
              },
            },
            required: ["accessToken", "refreshToken", "expiresIn"],
          },
          LoginRequest: {
            type: "object",
            properties: {
              username: { type: "string", minLength: 1 },
              password: { type: "string", minLength: 1 },
            },
            required: ["username", "password"],
          },
          RefreshRequest: {
            type: "object",
            properties: {
              refreshToken: { type: "string", minLength: 1 },
            },
            required: ["refreshToken"],
          },

          // Pagination
          Pagination: {
            type: "object",
            properties: {
              page: { type: "integer", minimum: 1, example: 1 },
              limit: { type: "integer", minimum: 1, maximum: 100, example: 20 },
              total: {
                type: "integer",
                minimum: 0,
                example: 100,
                description: "Total number of items",
              },
              totalPages: {
                type: "integer",
                minimum: 0,
                example: 5,
                description: "Total number of pages",
              },
            },
            required: ["page", "limit", "total", "totalPages"],
          },

          // IPAM Schemas
          Network: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              name: { type: "string", minLength: 1, maxLength: 100 },
              description: { type: "string", maxLength: 500, nullable: true },
              cidr: {
                type: "string",
                example: "10.0.0.0/8",
                description: "Network CIDR notation",
              },
              vlanId: {
                type: "integer",
                minimum: 1,
                maximum: 4094,
                nullable: true,
              },
              isActive: { type: "boolean" },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
              createdBy: { type: "string", format: "uuid" },
            },
            required: ["id", "name", "cidr", "isActive"],
          },
          CreateNetworkRequest: {
            type: "object",
            properties: {
              name: { type: "string", minLength: 1, maxLength: 100 },
              description: { type: "string", maxLength: 500 },
              cidr: { type: "string", example: "192.168.1.0/24" },
              vlanId: { type: "integer", minimum: 1, maximum: 4094 },
            },
            required: ["name", "cidr"],
          },
          Subnet: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              networkId: { type: "string", format: "uuid" },
              name: { type: "string" },
              cidr: { type: "string", example: "192.168.1.0/28" },
              gateway: { type: "string", format: "ipv4", nullable: true },
              vlanId: { type: "integer", nullable: true },
              isActive: { type: "boolean" },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
            },
            required: ["id", "networkId", "name", "cidr", "isActive"],
          },
          IPAddress: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              subnetId: { type: "string", format: "uuid" },
              address: { type: "string", format: "ipv4" },
              hostname: { type: "string", nullable: true },
              macAddress: {
                type: "string",
                nullable: true,
                pattern: "^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$",
              },
              status: {
                type: "string",
                enum: ["available", "allocated", "reserved", "offline"],
              },
              lastSeen: { type: "string", format: "date-time", nullable: true },
              allocatedTo: { type: "string", nullable: true },
              notes: { type: "string", nullable: true },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
            },
            required: ["id", "subnetId", "address", "status"],
          },

          // NPM Schemas
          Device: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              name: { type: "string" },
              ipAddress: { type: "string", format: "ipv4" },
              deviceType: {
                type: "string",
                enum: ["router", "switch", "firewall", "server", "ap", "other"],
              },
              vendor: { type: "string", nullable: true },
              model: { type: "string", nullable: true },
              snmpCommunity: { type: "string", nullable: true },
              isMonitored: { type: "boolean" },
              lastPolled: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              status: {
                type: "string",
                enum: ["up", "down", "unknown", "maintenance"],
              },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
            },
            required: ["id", "name", "ipAddress", "deviceType", "status"],
          },
          MetricSample: {
            type: "object",
            properties: {
              timestamp: { type: "string", format: "date-time" },
              value: { type: "number" },
              unit: { type: "string" },
            },
            required: ["timestamp", "value"],
          },
          Alert: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              deviceId: { type: "string", format: "uuid" },
              severity: {
                type: "string",
                enum: ["critical", "warning", "info"],
              },
              message: { type: "string" },
              isAcknowledged: { type: "boolean" },
              acknowledgedBy: {
                type: "string",
                format: "uuid",
                nullable: true,
              },
              acknowledgedAt: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              triggeredAt: { type: "string", format: "date-time" },
              resolvedAt: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
            },
            required: ["id", "deviceId", "severity", "message", "triggeredAt"],
          },

          // STIG Schemas
          Benchmark: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              stigId: { type: "string", example: "RHEL_9_STIG" },
              title: { type: "string" },
              version: { type: "string", example: "V1R1" },
              releaseDate: { type: "string", format: "date" },
              description: { type: "string", nullable: true },
              ruleCount: { type: "integer" },
              createdAt: { type: "string", format: "date-time" },
            },
            required: ["id", "stigId", "title", "version", "ruleCount"],
          },
          Assessment: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              benchmarkId: { type: "string", format: "uuid" },
              targetHost: { type: "string" },
              status: {
                type: "string",
                enum: ["pending", "running", "completed", "failed"],
              },
              startedAt: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              completedAt: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              summary: {
                type: "object",
                properties: {
                  pass: { type: "integer" },
                  fail: { type: "integer" },
                  notApplicable: { type: "integer" },
                  notChecked: { type: "integer" },
                },
              },
              createdBy: { type: "string", format: "uuid" },
              createdAt: { type: "string", format: "date-time" },
            },
            required: ["id", "benchmarkId", "targetHost", "status"],
          },

          // Health Schemas
          HealthStatus: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["ok", "degraded", "unhealthy"],
              },
              timestamp: { type: "string", format: "date-time" },
            },
            required: ["status"],
          },
          ReadinessStatus: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["ready", "not_ready"],
              },
              checks: {
                type: "object",
                properties: {
                  database: {
                    type: "object",
                    properties: {
                      status: {
                        type: "string",
                        enum: ["healthy", "unhealthy"],
                      },
                      error: { type: "string", nullable: true },
                    },
                  },
                  redis: {
                    type: "object",
                    properties: {
                      status: {
                        type: "string",
                        enum: ["healthy", "unhealthy"],
                      },
                      error: { type: "string", nullable: true },
                    },
                  },
                },
              },
            },
            required: ["status", "checks"],
          },
        },
        responses: {
          Unauthorized: {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: {
                  success: false,
                  error: {
                    code: "UNAUTHORIZED",
                    message: "Authentication required",
                  },
                },
              },
            },
          },
          Forbidden: {
            description: "Insufficient permissions",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: {
                  success: false,
                  error: {
                    code: "FORBIDDEN",
                    message:
                      "You do not have permission to perform this action",
                  },
                },
              },
            },
          },
          NotFound: {
            description: "Resource not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: {
                  success: false,
                  error: {
                    code: "NOT_FOUND",
                    message: "The requested resource was not found",
                  },
                },
              },
            },
          },
          RateLimited: {
            description: "Too many requests",
            headers: {
              "Retry-After": {
                schema: { type: "integer" },
                description: "Number of seconds to wait before retrying",
              },
              "X-RateLimit-Limit": {
                schema: { type: "integer" },
                description: "Maximum requests allowed in window",
              },
              "X-RateLimit-Reset": {
                schema: { type: "integer" },
                description: "Unix timestamp when limit resets",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: {
                  success: false,
                  error: {
                    code: "RATE_LIMITED",
                    message: "Too many requests. Please try again later.",
                    retryAfter: 60,
                  },
                },
              },
            },
          },
          ValidationError: {
            description: "Invalid request data",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: {
                  success: false,
                  error: {
                    code: "VALIDATION_ERROR",
                    message: "Request validation failed",
                    details: {
                      field: "cidr",
                      issue: "Invalid CIDR notation",
                    },
                  },
                },
              },
            },
          },
          InternalError: {
            description: "Internal server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: {
                  success: false,
                  error: {
                    code: "INTERNAL_ERROR",
                    message: "An unexpected error occurred",
                  },
                },
              },
            },
          },
        },
        parameters: {
          pageParam: {
            name: "page",
            in: "query",
            description: "Page number (1-indexed)",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          limitParam: {
            name: "limit",
            in: "query",
            description: "Number of items per page",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
          sortParam: {
            name: "sort",
            in: "query",
            description: "Sort field (prefix with - for descending)",
            schema: { type: "string", example: "-createdAt" },
          },
          searchParam: {
            name: "search",
            in: "query",
            description: "Search query string",
            schema: { type: "string" },
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
      displayRequestDuration: true,
      filter: true,
      syntaxHighlight: {
        theme: "monokai",
      },
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });
};

export default fp(swaggerPlugin, {
  name: "swagger",
  fastify: "5.x",
});
