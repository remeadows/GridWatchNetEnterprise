/**
 * NetNynja Enterprise - Syslog API Routes
 *
 * Provides API endpoints for syslog collection, filtering, and forwarding.
 * UDP 514 listener runs in the syslog-collector service.
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { pool } from "../../db";
import { logger } from "../../logger";

// Zod schemas
const sourceSchema = z.object({
  name: z.string().min(1).max(255),
  ipAddress: z.string().ip(),
  port: z.number().int().min(1).max(65535).default(514),
  protocol: z.enum(["udp", "tcp", "tls"]).default("udp"),
  hostname: z.string().max(255).optional(),
  deviceType: z.string().max(100).optional(),
  isActive: z.boolean().default(true),
});

const updateSourceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  ipAddress: z.string().ip().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  protocol: z.enum(["udp", "tcp", "tls"]).optional(),
  hostname: z.string().max(255).optional(),
  deviceType: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
});

const filterSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  priority: z.number().int().min(1).max(1000).default(100),
  criteria: z.object({
    severity: z.array(z.string()).optional(),
    facility: z.array(z.string()).optional(),
    hostname: z.string().optional(),
    messagePattern: z.string().optional(),
    deviceType: z.string().optional(),
    eventType: z.string().optional(),
  }),
  action: z.enum(["alert", "drop", "forward", "tag"]),
  actionConfig: z.record(z.unknown()).optional(),
  isActive: z.boolean().default(true),
});

const updateFilterSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  priority: z.number().int().min(1).max(1000).optional(),
  criteria: z
    .object({
      severity: z.array(z.string()).optional(),
      facility: z.array(z.string()).optional(),
      hostname: z.string().optional(),
      messagePattern: z.string().optional(),
      deviceType: z.string().optional(),
      eventType: z.string().optional(),
    })
    .optional(),
  action: z.enum(["alert", "drop", "forward", "tag"]).optional(),
  actionConfig: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

const forwarderSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  targetHost: z.string().min(1).max(255),
  targetPort: z.number().int().min(1).max(65535).default(514),
  protocol: z.enum(["udp", "tcp", "tls"]).default("tcp"),
  tlsEnabled: z.boolean().default(false),
  tlsVerify: z.boolean().default(true),
  filterCriteria: z.record(z.unknown()).optional(),
  bufferSize: z.number().int().min(100).max(100000).default(10000),
  retryCount: z.number().int().min(0).max(10).default(3),
  retryDelayMs: z.number().int().min(100).max(60000).default(1000),
  isActive: z.boolean().default(true),
});

const updateForwarderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  targetHost: z.string().min(1).max(255).optional(),
  targetPort: z.number().int().min(1).max(65535).optional(),
  protocol: z.enum(["udp", "tcp", "tls"]).optional(),
  tlsEnabled: z.boolean().optional(),
  tlsVerify: z.boolean().optional(),
  filterCriteria: z.record(z.unknown()).optional(),
  bufferSize: z.number().int().min(100).max(100000).optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
  retryDelayMs: z.number().int().min(100).max(60000).optional(),
  isActive: z.boolean().optional(),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

const eventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  severity: z.string().optional(),
  facility: z.string().optional(),
  hostname: z.string().optional(),
  sourceIp: z.string().optional(),
  deviceType: z.string().optional(),
  eventType: z.string().optional(),
  search: z.string().optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
});

// Severity names (RFC 5424)
const severityNames = [
  "emergency",
  "alert",
  "critical",
  "error",
  "warning",
  "notice",
  "informational",
  "debug",
] as const;

// Facility names (RFC 5424)
const facilityNames = [
  "kern",
  "user",
  "mail",
  "daemon",
  "auth",
  "syslog",
  "lpr",
  "news",
  "uucp",
  "cron",
  "authpriv",
  "ftp",
  "ntp",
  "audit",
  "alert",
  "clock",
  "local0",
  "local1",
  "local2",
  "local3",
  "local4",
  "local5",
  "local6",
  "local7",
] as const;

const syslogRoutes: FastifyPluginAsync = async (fastify) => {
  // Require authentication for all syslog routes
  fastify.addHook("preHandler", fastify.requireAuth);

  // ============================================
  // EVENTS ENDPOINTS
  // ============================================

  // List syslog events
  fastify.get(
    "/events",
    {
      schema: {
        tags: ["Syslog - Events"],
        summary: "List syslog events with filtering",
        description:
          "Retrieve syslog events with optional filtering by severity, facility, hostname, etc.",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            page: { type: "number", minimum: 1, default: 1 },
            limit: { type: "number", minimum: 1, maximum: 1000, default: 100 },
            severity: {
              type: "string",
              description: "Filter by severity name",
            },
            facility: {
              type: "string",
              description: "Filter by facility name",
            },
            hostname: { type: "string", description: "Filter by hostname" },
            sourceIp: { type: "string", description: "Filter by source IP" },
            deviceType: {
              type: "string",
              description: "Filter by device type",
            },
            eventType: { type: "string", description: "Filter by event type" },
            search: { type: "string", description: "Search in message text" },
            startTime: { type: "string", format: "date-time" },
            endTime: { type: "string", format: "date-time" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const query = eventsQuerySchema.parse(request.query);
        const offset = (query.page - 1) * query.limit;

        // Build WHERE clause params starting from $1
        const conditions: string[] = [];
        const whereParams: unknown[] = [];
        let paramIndex = 1;

        // Time range filter
        if (query.startTime) {
          conditions.push(`received_at >= $${paramIndex}`);
          whereParams.push(query.startTime);
          paramIndex++;
        }
        if (query.endTime) {
          conditions.push(`received_at <= $${paramIndex}`);
          whereParams.push(query.endTime);
          paramIndex++;
        }

        // Severity filter
        if (query.severity) {
          const sevIndex = severityNames.indexOf(
            query.severity.toLowerCase() as (typeof severityNames)[number],
          );
          if (sevIndex !== -1) {
            conditions.push(`severity = $${paramIndex}`);
            whereParams.push(sevIndex);
            paramIndex++;
          }
        }

        // Facility filter
        if (query.facility) {
          const facIndex = facilityNames.indexOf(
            query.facility.toLowerCase() as (typeof facilityNames)[number],
          );
          if (facIndex !== -1) {
            conditions.push(`facility = $${paramIndex}`);
            whereParams.push(facIndex);
            paramIndex++;
          }
        }

        // Other filters
        if (query.hostname) {
          conditions.push(`hostname ILIKE $${paramIndex}`);
          whereParams.push(`%${query.hostname}%`);
          paramIndex++;
        }
        if (query.sourceIp) {
          conditions.push(`source_ip = $${paramIndex}::inet`);
          whereParams.push(query.sourceIp);
          paramIndex++;
        }
        if (query.deviceType) {
          conditions.push(`device_type = $${paramIndex}`);
          whereParams.push(query.deviceType);
          paramIndex++;
        }
        if (query.eventType) {
          conditions.push(`event_type = $${paramIndex}`);
          whereParams.push(query.eventType);
          paramIndex++;
        }
        if (query.search) {
          conditions.push(`message ILIKE $${paramIndex}`);
          whereParams.push(`%${query.search}%`);
          paramIndex++;
        }

        const whereClause =
          conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        // Count query uses WHERE params starting from $1
        const countQuery = `SELECT COUNT(*) FROM syslog.events ${whereClause}`;

        // Data query: WHERE clause params, then LIMIT and OFFSET
        const limitParamIndex = paramIndex;
        const offsetParamIndex = paramIndex + 1;
        const dataQuery = `
          SELECT e.id, e.source_id, e.source_ip, e.received_at, e.facility, e.severity,
                 e.version, e.timestamp, e.hostname, e.app_name, e.proc_id, e.msg_id,
                 e.structured_data, e.message, e.device_type, e.event_type, e.tags,
                 s.name as source_name
          FROM syslog.events e
          LEFT JOIN syslog.sources s ON e.source_id = s.id
          ${whereClause}
          ORDER BY e.received_at DESC
          LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
        `;

        // Data query params: WHERE params + LIMIT + OFFSET
        const dataParams = [...whereParams, query.limit, offset];

        const [countResult, dataResult] = await Promise.all([
          pool.query(countQuery, whereParams),
          pool.query(dataQuery, dataParams),
        ]);

        const total = countResult.rows[0]?.count
          ? parseInt(countResult.rows[0].count, 10)
          : 0;

        return {
          success: true,
          data: dataResult.rows.map((row) => ({
            id: row.id,
            sourceId: row.source_id,
            sourceName: row.source_name,
            sourceIp: row.source_ip,
            receivedAt: row.received_at,
            facility: facilityNames[row.facility] || row.facility,
            facilityCode: row.facility,
            severity: severityNames[row.severity] || row.severity,
            severityCode: row.severity,
            version: row.version,
            timestamp: row.timestamp,
            hostname: row.hostname,
            appName: row.app_name,
            procId: row.proc_id,
            msgId: row.msg_id,
            structuredData: row.structured_data,
            message: row.message,
            deviceType: row.device_type,
            eventType: row.event_type,
            tags: row.tags,
          })),
          pagination: {
            page: query.page,
            limit: query.limit,
            total,
            pages: Math.ceil(total / query.limit),
          },
        };
      } catch (error) {
        request.log.error({ error }, "Failed to fetch syslog events");
        return reply.status(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to fetch syslog events",
          },
        });
      }
    },
  );

  // Get event statistics
  fastify.get(
    "/events/stats",
    {
      schema: {
        tags: ["Syslog - Events"],
        summary: "Get syslog event statistics",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            hours: { type: "number", minimum: 1, maximum: 168, default: 24 },
          },
        },
      },
    },
    async (request, reply) => {
      const { hours = 24 } = request.query as { hours?: number };
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const [totalResult, severityResult, facilityResult, sourceResult] =
        await Promise.all([
          pool.query(
            `SELECT COUNT(*) as total,
                  COUNT(*) FILTER (WHERE severity <= 3) as critical_and_above
           FROM syslog.events
           WHERE received_at >= $1`,
            [since],
          ),
          pool.query(
            `SELECT severity, COUNT(*) as count
           FROM syslog.events
           WHERE received_at >= $1
           GROUP BY severity
           ORDER BY severity`,
            [since],
          ),
          pool.query(
            `SELECT facility, COUNT(*) as count
           FROM syslog.events
           WHERE received_at >= $1
           GROUP BY facility
           ORDER BY count DESC
           LIMIT 10`,
            [since],
          ),
          pool.query(
            `SELECT source_ip, hostname, COUNT(*) as count
           FROM syslog.events
           WHERE received_at >= $1
           GROUP BY source_ip, hostname
           ORDER BY count DESC
           LIMIT 10`,
            [since],
          ),
        ]);

      return {
        success: true,
        data: {
          timeRange: {
            hours,
            since: since.toISOString(),
          },
          totals: {
            events: parseInt(totalResult.rows[0].total, 10),
            criticalAndAbove: parseInt(
              totalResult.rows[0].critical_and_above,
              10,
            ),
          },
          bySeverity: severityResult.rows.map((row) => ({
            severity: severityNames[row.severity] || row.severity,
            severityCode: row.severity,
            count: parseInt(row.count, 10),
          })),
          byFacility: facilityResult.rows.map((row) => ({
            facility: facilityNames[row.facility] || row.facility,
            facilityCode: row.facility,
            count: parseInt(row.count, 10),
          })),
          topSources: sourceResult.rows.map((row) => ({
            sourceIp: row.source_ip,
            hostname: row.hostname,
            count: parseInt(row.count, 10),
          })),
        },
      };
    },
  );

  // ============================================
  // SOURCES ENDPOINTS
  // ============================================

  // List sources
  fastify.get(
    "/sources",
    {
      schema: {
        tags: ["Syslog - Sources"],
        summary: "List syslog sources",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            page: { type: "number", minimum: 1, default: 1 },
            limit: { type: "number", minimum: 1, maximum: 100, default: 20 },
            search: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const query = querySchema.parse(request.query);
      const offset = (query.page - 1) * query.limit;

      const conditions: string[] = [];
      const params: unknown[] = [query.limit, offset];
      let paramIndex = 3;

      if (query.search) {
        conditions.push(
          `(name ILIKE $${paramIndex} OR ip_address::text ILIKE $${paramIndex} OR hostname ILIKE $${paramIndex})`,
        );
        params.push(`%${query.search}%`);
        paramIndex++;
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const countQuery = `SELECT COUNT(*) FROM syslog.sources ${whereClause}`;
      const dataQuery = `
        SELECT id, name, ip_address, port, protocol, hostname, device_type,
               is_active, events_received, last_event_at, created_at, updated_at
        FROM syslog.sources
        ${whereClause}
        ORDER BY name
        LIMIT $1 OFFSET $2
      `;

      const [countResult, dataResult] = await Promise.all([
        pool.query(countQuery, params.slice(2)),
        pool.query(dataQuery, params),
      ]);

      return {
        success: true,
        data: dataResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          ipAddress: row.ip_address,
          port: row.port,
          protocol: row.protocol,
          hostname: row.hostname,
          deviceType: row.device_type,
          isActive: row.is_active,
          eventsReceived: parseInt(row.events_received, 10),
          lastEventAt: row.last_event_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
        pagination: {
          page: query.page,
          limit: query.limit,
          total: parseInt(countResult.rows[0].count, 10),
          pages: Math.ceil(
            parseInt(countResult.rows[0].count, 10) / query.limit,
          ),
        },
      };
    },
  );

  // Create source
  fastify.post(
    "/sources",
    {
      schema: {
        tags: ["Syslog - Sources"],
        summary: "Add a syslog source",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["name", "ipAddress"],
          properties: {
            name: { type: "string" },
            ipAddress: { type: "string" },
            port: { type: "number", default: 514 },
            protocol: {
              type: "string",
              enum: ["udp", "tcp", "tls"],
              default: "udp",
            },
            hostname: { type: "string" },
            deviceType: { type: "string" },
            isActive: { type: "boolean", default: true },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const body = sourceSchema.parse(request.body);

      const result = await pool.query(
        `INSERT INTO syslog.sources (name, ip_address, port, protocol, hostname, device_type, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, ip_address, port, protocol, hostname, device_type,
                   is_active, events_received, last_event_at, created_at, updated_at`,
        [
          body.name,
          body.ipAddress,
          body.port,
          body.protocol,
          body.hostname,
          body.deviceType,
          body.isActive,
        ],
      );

      const row = result.rows[0];
      reply.status(201);
      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          ipAddress: row.ip_address,
          port: row.port,
          protocol: row.protocol,
          hostname: row.hostname,
          deviceType: row.device_type,
          isActive: row.is_active,
          eventsReceived: parseInt(row.events_received, 10),
          lastEventAt: row.last_event_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Update source
  fastify.patch(
    "/sources/:id",
    {
      schema: {
        tags: ["Syslog - Sources"],
        summary: "Update a syslog source",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateSourceSchema.parse(request.body);

      // Build update query dynamically
      const updates: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (body.name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        params.push(body.name);
      }
      if (body.ipAddress !== undefined) {
        updates.push(`ip_address = $${paramIndex++}`);
        params.push(body.ipAddress);
      }
      if (body.port !== undefined) {
        updates.push(`port = $${paramIndex++}`);
        params.push(body.port);
      }
      if (body.protocol !== undefined) {
        updates.push(`protocol = $${paramIndex++}`);
        params.push(body.protocol);
      }
      if (body.hostname !== undefined) {
        updates.push(`hostname = $${paramIndex++}`);
        params.push(body.hostname);
      }
      if (body.deviceType !== undefined) {
        updates.push(`device_type = $${paramIndex++}`);
        params.push(body.deviceType);
      }
      if (body.isActive !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        params.push(body.isActive);
      }

      if (updates.length === 0) {
        reply.status(400);
        return {
          success: false,
          error: { code: "BAD_REQUEST", message: "No fields to update" },
        };
      }

      params.push(id);
      const result = await pool.query(
        `UPDATE syslog.sources SET ${updates.join(", ")}
         WHERE id = $${paramIndex}
         RETURNING id, name, ip_address, port, protocol, hostname, device_type,
                   is_active, events_received, last_event_at, created_at, updated_at`,
        params,
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Source not found" },
        };
      }

      const row = result.rows[0];
      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          ipAddress: row.ip_address,
          port: row.port,
          protocol: row.protocol,
          hostname: row.hostname,
          deviceType: row.device_type,
          isActive: row.is_active,
          eventsReceived: parseInt(row.events_received, 10),
          lastEventAt: row.last_event_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Delete source
  fastify.delete(
    "/sources/:id",
    {
      schema: {
        tags: ["Syslog - Sources"],
        summary: "Delete a syslog source",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
      },
      preHandler: [fastify.requireRole("admin")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const result = await pool.query(
        "DELETE FROM syslog.sources WHERE id = $1 RETURNING id",
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Source not found" },
        };
      }

      return reply.status(204).send();
    },
  );

  // ============================================
  // FILTERS ENDPOINTS
  // ============================================

  // List filters
  fastify.get(
    "/filters",
    {
      schema: {
        tags: ["Syslog - Filters"],
        summary: "List syslog filters",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            page: { type: "number", minimum: 1, default: 1 },
            limit: { type: "number", minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    },
    async (request, reply) => {
      const query = querySchema.parse(request.query);
      const offset = (query.page - 1) * query.limit;

      const countQuery = `SELECT COUNT(*) FROM syslog.filters`;
      const dataQuery = `
        SELECT id, name, description, priority, criteria, action, action_config,
               is_active, match_count, last_match_at, created_at, updated_at
        FROM syslog.filters
        ORDER BY priority, name
        LIMIT $1 OFFSET $2
      `;

      const [countResult, dataResult] = await Promise.all([
        pool.query(countQuery),
        pool.query(dataQuery, [query.limit, offset]),
      ]);

      return {
        success: true,
        data: dataResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          priority: row.priority,
          criteria: row.criteria,
          action: row.action,
          actionConfig: row.action_config,
          isActive: row.is_active,
          matchCount: parseInt(row.match_count, 10),
          lastMatchAt: row.last_match_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
        pagination: {
          page: query.page,
          limit: query.limit,
          total: parseInt(countResult.rows[0].count, 10),
          pages: Math.ceil(
            parseInt(countResult.rows[0].count, 10) / query.limit,
          ),
        },
      };
    },
  );

  // Create filter
  fastify.post(
    "/filters",
    {
      schema: {
        tags: ["Syslog - Filters"],
        summary: "Create a syslog filter",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["name", "criteria", "action"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            priority: { type: "number", default: 100 },
            criteria: { type: "object" },
            action: {
              type: "string",
              enum: ["alert", "drop", "forward", "tag"],
            },
            actionConfig: { type: "object" },
            isActive: { type: "boolean", default: true },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const body = filterSchema.parse(request.body);
      const user = request.user!;

      const result = await pool.query(
        `INSERT INTO syslog.filters (name, description, priority, criteria, action, action_config, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name, description, priority, criteria, action, action_config,
                   is_active, match_count, last_match_at, created_at, updated_at`,
        [
          body.name,
          body.description,
          body.priority,
          JSON.stringify(body.criteria),
          body.action,
          JSON.stringify(body.actionConfig || {}),
          body.isActive,
          user.sub,
        ],
      );

      const row = result.rows[0];
      reply.status(201);
      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          description: row.description,
          priority: row.priority,
          criteria: row.criteria,
          action: row.action,
          actionConfig: row.action_config,
          isActive: row.is_active,
          matchCount: parseInt(row.match_count, 10),
          lastMatchAt: row.last_match_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Update filter
  fastify.patch(
    "/filters/:id",
    {
      schema: {
        tags: ["Syslog - Filters"],
        summary: "Update a syslog filter",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateFilterSchema.parse(request.body);

      const updates: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (body.name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        params.push(body.name);
      }
      if (body.description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        params.push(body.description);
      }
      if (body.priority !== undefined) {
        updates.push(`priority = $${paramIndex++}`);
        params.push(body.priority);
      }
      if (body.criteria !== undefined) {
        updates.push(`criteria = $${paramIndex++}`);
        params.push(JSON.stringify(body.criteria));
      }
      if (body.action !== undefined) {
        updates.push(`action = $${paramIndex++}`);
        params.push(body.action);
      }
      if (body.actionConfig !== undefined) {
        updates.push(`action_config = $${paramIndex++}`);
        params.push(JSON.stringify(body.actionConfig));
      }
      if (body.isActive !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        params.push(body.isActive);
      }

      if (updates.length === 0) {
        reply.status(400);
        return {
          success: false,
          error: { code: "BAD_REQUEST", message: "No fields to update" },
        };
      }

      params.push(id);
      const result = await pool.query(
        `UPDATE syslog.filters SET ${updates.join(", ")}
         WHERE id = $${paramIndex}
         RETURNING id, name, description, priority, criteria, action, action_config,
                   is_active, match_count, last_match_at, created_at, updated_at`,
        params,
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Filter not found" },
        };
      }

      const row = result.rows[0];
      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          description: row.description,
          priority: row.priority,
          criteria: row.criteria,
          action: row.action,
          actionConfig: row.action_config,
          isActive: row.is_active,
          matchCount: parseInt(row.match_count, 10),
          lastMatchAt: row.last_match_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Delete filter
  fastify.delete(
    "/filters/:id",
    {
      schema: {
        tags: ["Syslog - Filters"],
        summary: "Delete a syslog filter",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
      },
      preHandler: [fastify.requireRole("admin")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const result = await pool.query(
        "DELETE FROM syslog.filters WHERE id = $1 RETURNING id",
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Filter not found" },
        };
      }

      return reply.status(204).send();
    },
  );

  // ============================================
  // FORWARDERS ENDPOINTS
  // ============================================

  // List forwarders
  fastify.get(
    "/forwarders",
    {
      schema: {
        tags: ["Syslog - Forwarders"],
        summary: "List syslog forwarders",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            page: { type: "number", minimum: 1, default: 1 },
            limit: { type: "number", minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    },
    async (request, reply) => {
      const query = querySchema.parse(request.query);
      const offset = (query.page - 1) * query.limit;

      const countQuery = `SELECT COUNT(*) FROM syslog.forwarders`;
      const dataQuery = `
        SELECT id, name, description, target_host, target_port, protocol,
               tls_enabled, tls_verify, filter_criteria, is_active,
               events_forwarded, last_forward_at, last_error, last_error_at,
               buffer_size, retry_count, retry_delay_ms, created_at, updated_at
        FROM syslog.forwarders
        ORDER BY name
        LIMIT $1 OFFSET $2
      `;

      const [countResult, dataResult] = await Promise.all([
        pool.query(countQuery),
        pool.query(dataQuery, [query.limit, offset]),
      ]);

      return {
        success: true,
        data: dataResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          targetHost: row.target_host,
          targetPort: row.target_port,
          protocol: row.protocol,
          tlsEnabled: row.tls_enabled,
          tlsVerify: row.tls_verify,
          filterCriteria: row.filter_criteria,
          isActive: row.is_active,
          eventsForwarded: parseInt(row.events_forwarded, 10),
          lastForwardAt: row.last_forward_at,
          lastError: row.last_error,
          lastErrorAt: row.last_error_at,
          bufferSize: row.buffer_size,
          retryCount: row.retry_count,
          retryDelayMs: row.retry_delay_ms,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
        pagination: {
          page: query.page,
          limit: query.limit,
          total: parseInt(countResult.rows[0].count, 10),
          pages: Math.ceil(
            parseInt(countResult.rows[0].count, 10) / query.limit,
          ),
        },
      };
    },
  );

  // Create forwarder
  fastify.post(
    "/forwarders",
    {
      schema: {
        tags: ["Syslog - Forwarders"],
        summary: "Create a syslog forwarder",
        description:
          "Create a forwarder to send syslog events to an external system",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["name", "targetHost"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            targetHost: { type: "string" },
            targetPort: { type: "number", default: 514 },
            protocol: {
              type: "string",
              enum: ["udp", "tcp", "tls"],
              default: "tcp",
            },
            tlsEnabled: { type: "boolean", default: false },
            tlsVerify: { type: "boolean", default: true },
            filterCriteria: { type: "object" },
            bufferSize: { type: "number", default: 10000 },
            retryCount: { type: "number", default: 3 },
            retryDelayMs: { type: "number", default: 1000 },
            isActive: { type: "boolean", default: true },
          },
        },
      },
      preHandler: [fastify.requireRole("admin")],
    },
    async (request, reply) => {
      const body = forwarderSchema.parse(request.body);
      const user = request.user!;

      const result = await pool.query(
        `INSERT INTO syslog.forwarders
         (name, description, target_host, target_port, protocol, tls_enabled, tls_verify,
          filter_criteria, buffer_size, retry_count, retry_delay_ms, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id, name, description, target_host, target_port, protocol,
                   tls_enabled, tls_verify, filter_criteria, is_active,
                   events_forwarded, last_forward_at, buffer_size, retry_count,
                   retry_delay_ms, created_at, updated_at`,
        [
          body.name,
          body.description,
          body.targetHost,
          body.targetPort,
          body.protocol,
          body.tlsEnabled,
          body.tlsVerify,
          JSON.stringify(body.filterCriteria || {}),
          body.bufferSize,
          body.retryCount,
          body.retryDelayMs,
          body.isActive,
          user.sub,
        ],
      );

      const row = result.rows[0];
      reply.status(201);
      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          description: row.description,
          targetHost: row.target_host,
          targetPort: row.target_port,
          protocol: row.protocol,
          tlsEnabled: row.tls_enabled,
          tlsVerify: row.tls_verify,
          filterCriteria: row.filter_criteria,
          isActive: row.is_active,
          eventsForwarded: parseInt(row.events_forwarded, 10),
          lastForwardAt: row.last_forward_at,
          bufferSize: row.buffer_size,
          retryCount: row.retry_count,
          retryDelayMs: row.retry_delay_ms,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Update forwarder
  fastify.patch(
    "/forwarders/:id",
    {
      schema: {
        tags: ["Syslog - Forwarders"],
        summary: "Update a syslog forwarder",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
      },
      preHandler: [fastify.requireRole("admin")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateForwarderSchema.parse(request.body);

      const updates: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (body.name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        params.push(body.name);
      }
      if (body.description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        params.push(body.description);
      }
      if (body.targetHost !== undefined) {
        updates.push(`target_host = $${paramIndex++}`);
        params.push(body.targetHost);
      }
      if (body.targetPort !== undefined) {
        updates.push(`target_port = $${paramIndex++}`);
        params.push(body.targetPort);
      }
      if (body.protocol !== undefined) {
        updates.push(`protocol = $${paramIndex++}`);
        params.push(body.protocol);
      }
      if (body.tlsEnabled !== undefined) {
        updates.push(`tls_enabled = $${paramIndex++}`);
        params.push(body.tlsEnabled);
      }
      if (body.tlsVerify !== undefined) {
        updates.push(`tls_verify = $${paramIndex++}`);
        params.push(body.tlsVerify);
      }
      if (body.filterCriteria !== undefined) {
        updates.push(`filter_criteria = $${paramIndex++}`);
        params.push(JSON.stringify(body.filterCriteria));
      }
      if (body.bufferSize !== undefined) {
        updates.push(`buffer_size = $${paramIndex++}`);
        params.push(body.bufferSize);
      }
      if (body.retryCount !== undefined) {
        updates.push(`retry_count = $${paramIndex++}`);
        params.push(body.retryCount);
      }
      if (body.retryDelayMs !== undefined) {
        updates.push(`retry_delay_ms = $${paramIndex++}`);
        params.push(body.retryDelayMs);
      }
      if (body.isActive !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        params.push(body.isActive);
      }

      if (updates.length === 0) {
        reply.status(400);
        return {
          success: false,
          error: { code: "BAD_REQUEST", message: "No fields to update" },
        };
      }

      params.push(id);
      const result = await pool.query(
        `UPDATE syslog.forwarders SET ${updates.join(", ")}
         WHERE id = $${paramIndex}
         RETURNING id, name, description, target_host, target_port, protocol,
                   tls_enabled, tls_verify, filter_criteria, is_active,
                   events_forwarded, last_forward_at, last_error, last_error_at,
                   buffer_size, retry_count, retry_delay_ms, created_at, updated_at`,
        params,
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Forwarder not found" },
        };
      }

      const row = result.rows[0];
      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          description: row.description,
          targetHost: row.target_host,
          targetPort: row.target_port,
          protocol: row.protocol,
          tlsEnabled: row.tls_enabled,
          tlsVerify: row.tls_verify,
          filterCriteria: row.filter_criteria,
          isActive: row.is_active,
          eventsForwarded: parseInt(row.events_forwarded, 10),
          lastForwardAt: row.last_forward_at,
          lastError: row.last_error,
          lastErrorAt: row.last_error_at,
          bufferSize: row.buffer_size,
          retryCount: row.retry_count,
          retryDelayMs: row.retry_delay_ms,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Delete forwarder
  fastify.delete(
    "/forwarders/:id",
    {
      schema: {
        tags: ["Syslog - Forwarders"],
        summary: "Delete a syslog forwarder",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
      },
      preHandler: [fastify.requireRole("admin")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const result = await pool.query(
        "DELETE FROM syslog.forwarders WHERE id = $1 RETURNING id",
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Forwarder not found" },
        };
      }

      return reply.status(204).send();
    },
  );

  // ============================================
  // BUFFER SETTINGS ENDPOINTS
  // ============================================

  // Get buffer settings
  fastify.get(
    "/buffer-settings",
    {
      schema: {
        tags: ["Syslog - Buffer"],
        summary: "Get syslog buffer settings",
        description:
          "Get the current 10GB circular buffer configuration and status",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const result = await pool.query(
        `SELECT max_size_bytes, current_size_bytes, retention_days,
                cleanup_threshold_percent, last_cleanup_at, events_dropped_overflow,
                updated_at
         FROM syslog.buffer_settings
         WHERE id = 1`,
      );

      if (result.rows.length === 0) {
        // Insert default if not exists
        await pool.query(
          `INSERT INTO syslog.buffer_settings (max_size_bytes, retention_days)
           VALUES (10737418240, 30)
           ON CONFLICT (id) DO NOTHING`,
        );
        return {
          success: true,
          data: {
            maxSizeBytes: 10737418240,
            maxSizeGb: 10,
            currentSizeBytes: 0,
            currentSizeGb: 0,
            usagePercent: 0,
            retentionDays: 30,
            cleanupThresholdPercent: 90,
            lastCleanupAt: null,
            eventsDroppedOverflow: 0,
          },
        };
      }

      const row = result.rows[0];
      const maxSizeGb = parseInt(row.max_size_bytes, 10) / 1073741824;
      const currentSizeGb = parseInt(row.current_size_bytes, 10) / 1073741824;
      const usagePercent =
        (parseInt(row.current_size_bytes, 10) /
          parseInt(row.max_size_bytes, 10)) *
        100;

      return {
        success: true,
        data: {
          maxSizeBytes: parseInt(row.max_size_bytes, 10),
          maxSizeGb: Math.round(maxSizeGb * 100) / 100,
          currentSizeBytes: parseInt(row.current_size_bytes, 10),
          currentSizeGb: Math.round(currentSizeGb * 100) / 100,
          usagePercent: Math.round(usagePercent * 100) / 100,
          retentionDays: row.retention_days,
          cleanupThresholdPercent: row.cleanup_threshold_percent,
          lastCleanupAt: row.last_cleanup_at,
          eventsDroppedOverflow: parseInt(row.events_dropped_overflow, 10),
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Update buffer settings
  fastify.patch(
    "/buffer-settings",
    {
      schema: {
        tags: ["Syslog - Buffer"],
        summary: "Update syslog buffer settings",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            maxSizeGb: {
              type: "number",
              minimum: 1,
              maximum: 100,
              description: "Max buffer size in GB",
            },
            retentionDays: { type: "number", minimum: 1, maximum: 365 },
            cleanupThresholdPercent: {
              type: "number",
              minimum: 50,
              maximum: 95,
            },
          },
        },
      },
      preHandler: [fastify.requireRole("admin")],
    },
    async (request, reply) => {
      const body = request.body as {
        maxSizeGb?: number;
        retentionDays?: number;
        cleanupThresholdPercent?: number;
      };

      const updates: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (body.maxSizeGb !== undefined) {
        updates.push(`max_size_bytes = $${paramIndex++}`);
        params.push(Math.round(body.maxSizeGb * 1073741824)); // Convert GB to bytes
      }
      if (body.retentionDays !== undefined) {
        updates.push(`retention_days = $${paramIndex++}`);
        params.push(body.retentionDays);
      }
      if (body.cleanupThresholdPercent !== undefined) {
        updates.push(`cleanup_threshold_percent = $${paramIndex++}`);
        params.push(body.cleanupThresholdPercent);
      }

      if (updates.length === 0) {
        reply.status(400);
        return {
          success: false,
          error: { code: "BAD_REQUEST", message: "No fields to update" },
        };
      }

      const result = await pool.query(
        `UPDATE syslog.buffer_settings SET ${updates.join(", ")}, updated_at = NOW()
         WHERE id = 1
         RETURNING max_size_bytes, current_size_bytes, retention_days,
                   cleanup_threshold_percent, last_cleanup_at, events_dropped_overflow,
                   updated_at`,
        params,
      );

      const row = result.rows[0];
      const maxSizeGb = parseInt(row.max_size_bytes, 10) / 1073741824;
      const currentSizeGb = parseInt(row.current_size_bytes, 10) / 1073741824;
      const usagePercent =
        (parseInt(row.current_size_bytes, 10) /
          parseInt(row.max_size_bytes, 10)) *
        100;

      return {
        success: true,
        data: {
          maxSizeBytes: parseInt(row.max_size_bytes, 10),
          maxSizeGb: Math.round(maxSizeGb * 100) / 100,
          currentSizeBytes: parseInt(row.current_size_bytes, 10),
          currentSizeGb: Math.round(currentSizeGb * 100) / 100,
          usagePercent: Math.round(usagePercent * 100) / 100,
          retentionDays: row.retention_days,
          cleanupThresholdPercent: row.cleanup_threshold_percent,
          lastCleanupAt: row.last_cleanup_at,
          eventsDroppedOverflow: parseInt(row.events_dropped_overflow, 10),
          updatedAt: row.updated_at,
        },
      };
    },
  );
  // ============================================
  // STATS ENDPOINT (APP-021)
  // ============================================

  // Lightweight operational health stats
  fastify.get(
    "/stats",
    {
      schema: {
        tags: ["Syslog - Stats"],
        summary: "Get syslog ingestion health stats",
        description:
          "Lightweight endpoint for operational visibility: total event count, last event timestamp, and source count.",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      try {
        const [eventResult, sourceResult] = await Promise.all([
          pool.query(
            `SELECT
               COUNT(*) as event_count,
               MAX(received_at) as last_event_at
             FROM syslog.events`,
          ),
          pool.query(
            `SELECT COUNT(*) as source_count
             FROM syslog.sources
             WHERE is_active = true`,
          ),
        ]);

        const eventRow = eventResult.rows[0];
        const sourceRow = sourceResult.rows[0];

        return {
          success: true,
          data: {
            eventCount: parseInt(eventRow.event_count, 10),
            lastEventAt: eventRow.last_event_at,
            activeSourceCount: parseInt(sourceRow.source_count, 10),
          },
        };
      } catch (error) {
        request.log.error({ error }, "Failed to fetch syslog stats");
        return reply.status(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to fetch syslog stats",
          },
        });
      }
    },
  );
};

export default syslogRoutes;
