/**
 * GridWatch NetEnterprise - NPM (Network Performance Monitoring) API Routes
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { pool } from "../../db";
import { logger } from "../../logger";
import snmpv3CredentialsRoutes from "./snmpv3-credentials";
import discoveryRoutes from "./discovery";
import reportsRoutes from "./reports";
import deviceGroupsRoutes from "./device-groups";

// Zod schemas
const deviceSchema = z
  .object({
    name: z.string().min(1).max(255),
    ipAddress: z.string().ip(),
    deviceType: z.string().max(100).optional(),
    vendor: z.string().max(100).optional(),
    model: z.string().max(100).optional(),
    groupId: z.string().uuid().optional(),
    pollIcmp: z.boolean().default(true),
    pollSnmp: z.boolean().default(false),
    snmpv3CredentialId: z.string().uuid().optional(),
    snmpPort: z.number().int().min(1).max(65535).default(161),
    sshEnabled: z.boolean().default(false),
    pollInterval: z.number().int().min(30).max(3600).default(60),
    isActive: z.boolean().default(true),
  })
  .refine((data) => data.pollIcmp || data.pollSnmp, {
    message: "At least one polling method (ICMP or SNMP) must be enabled",
  })
  .refine(
    (data) => {
      if (data.pollSnmp) {
        return !!data.snmpv3CredentialId;
      }
      return true;
    },
    { message: "SNMPv3 credential is required when SNMP polling is enabled" },
  );

const updateDeviceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  ipAddress: z.string().ip().optional(),
  deviceType: z.string().max(100).optional(),
  vendor: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  groupId: z.string().uuid().nullable().optional(),
  pollIcmp: z.boolean().optional(),
  pollSnmp: z.boolean().optional(),
  snmpv3CredentialId: z.string().uuid().nullable().optional(),
  snmpPort: z.number().int().min(1).max(65535).optional(),
  sshEnabled: z.boolean().optional(),
  pollInterval: z.number().int().min(30).max(3600).optional(),
  isActive: z.boolean().optional(),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50), // Increased for 3000+ device support
  search: z.string().optional(),
  status: z.enum(["up", "down", "unknown"]).optional(),
  groupId: z.string().uuid().optional(),
  ungrouped: z.coerce.boolean().optional(), // Filter for devices not in any group
});

// Volume schemas
const volumeSchema = z.object({
  volumeIndex: z.number().int().min(0),
  name: z.string().max(255),
  description: z.string().optional(),
  type: z
    .enum([
      "hrStorageFixedDisk",
      "hrStorageRemovableDisk",
      "hrStorageFlashMemory",
      "hrStorageNetworkDisk",
      "hrStorageRam",
      "hrStorageVirtualMemory",
      "hrStorageOther",
    ])
    .optional(),
  mountPoint: z.string().max(512).optional(),
  totalBytes: z.number().int().optional(),
  usedBytes: z.number().int().optional(),
  isMonitored: z.boolean().default(true),
});

const metricsQuerySchema = z.object({
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  metricType: z
    .enum(["cpu", "memory", "bandwidth", "latency", "packet_loss"])
    .optional(),
});

// Poll Now schema
const pollDeviceSchema = z.object({
  methods: z
    .array(z.enum(["icmp", "snmp"]))
    .min(1, "At least one polling method must be selected"),
});

const npmRoutes: FastifyPluginAsync = async (fastify) => {
  // Register SNMPv3 credentials routes
  await fastify.register(snmpv3CredentialsRoutes, {
    prefix: "/snmpv3-credentials",
  });

  // Register discovery routes
  await fastify.register(discoveryRoutes, {
    prefix: "/discovery",
  });

  // Register reports routes
  await fastify.register(reportsRoutes, {
    prefix: "/reports",
  });

  // Register device groups routes
  await fastify.register(deviceGroupsRoutes, {
    prefix: "/device-groups",
  });

  // Require authentication for all NPM routes
  fastify.addHook("preHandler", fastify.requireAuth);

  // List monitored devices
  fastify.get(
    "/devices",
    {
      schema: {
        tags: ["NPM - Devices"],
        summary: "List monitored devices",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            page: { type: "number", minimum: 1, default: 1 },
            limit: { type: "number", minimum: 1, maximum: 500, default: 50 },
            search: { type: "string" },
            status: { type: "string", enum: ["up", "down", "unknown"] },
            groupId: { type: "string", format: "uuid" },
            ungrouped: { type: "boolean" },
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
          `(d.name ILIKE $${paramIndex} OR d.ip_address::text ILIKE $${paramIndex})`,
        );
        params.push(`%${query.search}%`);
        paramIndex++;
      }
      if (query.status) {
        conditions.push(`d.status = $${paramIndex}`);
        params.push(query.status);
        paramIndex++;
      }
      if (query.groupId) {
        conditions.push(`d.group_id = $${paramIndex}`);
        params.push(query.groupId);
        paramIndex++;
      }
      if (query.ungrouped) {
        conditions.push(`d.group_id IS NULL`);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const countQuery = `SELECT COUNT(*) FROM npm.devices d ${whereClause}`;
      const dataQuery = `
      SELECT d.id, d.name, d.ip_address, d.device_type, d.vendor, d.model, d.status,
             d.group_id, g.name as group_name, g.color as group_color,
             d.poll_icmp, d.poll_snmp, d.snmpv3_credential_id, c.name as snmpv3_credential_name,
             d.snmp_port, d.ssh_enabled, d.poll_interval, d.is_active,
             d.last_poll, d.last_icmp_poll, d.last_snmp_poll,
             d.icmp_status, d.snmp_status, d.created_at, d.updated_at
      FROM npm.devices d
      LEFT JOIN npm.snmpv3_credentials c ON d.snmpv3_credential_id = c.id
      LEFT JOIN npm.device_groups g ON d.group_id = g.id
      ${whereClause}
      ORDER BY d.name
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
          deviceType: row.device_type,
          vendor: row.vendor,
          model: row.model,
          status: row.status,
          groupId: row.group_id,
          groupName: row.group_name,
          groupColor: row.group_color,
          pollIcmp: row.poll_icmp,
          pollSnmp: row.poll_snmp,
          snmpv3CredentialId: row.snmpv3_credential_id,
          snmpv3CredentialName: row.snmpv3_credential_name,
          snmpPort: row.snmp_port,
          sshEnabled: row.ssh_enabled,
          pollInterval: row.poll_interval,
          isActive: row.is_active,
          lastPoll: row.last_poll,
          lastIcmpPoll: row.last_icmp_poll,
          lastSnmpPoll: row.last_snmp_poll,
          icmpStatus: row.icmp_status,
          snmpStatus: row.snmp_status,
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

  // Get device by ID
  fastify.get(
    "/devices/:id",
    {
      schema: {
        tags: ["NPM - Devices"],
        summary: "Get device by ID",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
          },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const result = await pool.query(
        `SELECT d.id, d.name, d.ip_address, d.device_type, d.vendor, d.model, d.status,
              d.group_id, g.name as group_name, g.color as group_color,
              d.poll_icmp, d.poll_snmp, d.snmpv3_credential_id, c.name as snmpv3_credential_name,
              d.snmp_port, d.ssh_enabled, d.poll_interval, d.is_active,
              d.last_poll, d.last_icmp_poll, d.last_snmp_poll,
              d.icmp_status, d.snmp_status, d.created_at, d.updated_at
       FROM npm.devices d
       LEFT JOIN npm.snmpv3_credentials c ON d.snmpv3_credential_id = c.id
       LEFT JOIN npm.device_groups g ON d.group_id = g.id
       WHERE d.id = $1`,
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Device not found" },
        };
      }

      const row = result.rows[0];
      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          ipAddress: row.ip_address,
          deviceType: row.device_type,
          vendor: row.vendor,
          model: row.model,
          status: row.status,
          groupId: row.group_id,
          groupName: row.group_name,
          groupColor: row.group_color,
          pollIcmp: row.poll_icmp,
          pollSnmp: row.poll_snmp,
          snmpv3CredentialId: row.snmpv3_credential_id,
          snmpv3CredentialName: row.snmpv3_credential_name,
          snmpPort: row.snmp_port,
          sshEnabled: row.ssh_enabled,
          pollInterval: row.poll_interval,
          isActive: row.is_active,
          lastPoll: row.last_poll,
          lastIcmpPoll: row.last_icmp_poll,
          lastSnmpPoll: row.last_snmp_poll,
          icmpStatus: row.icmp_status,
          snmpStatus: row.snmp_status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Create device
  fastify.post(
    "/devices",
    {
      schema: {
        tags: ["NPM - Devices"],
        summary: "Add a new device to monitoring",
        description:
          "Add a device with ICMP, SNMPv3, or both polling methods enabled.",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["name", "ipAddress"],
          properties: {
            name: { type: "string" },
            ipAddress: { type: "string" },
            deviceType: { type: "string" },
            vendor: { type: "string" },
            model: { type: "string" },
            groupId: { type: "string", format: "uuid" },
            pollIcmp: { type: "boolean", default: true },
            pollSnmp: { type: "boolean", default: false },
            snmpv3CredentialId: { type: "string", format: "uuid" },
            snmpPort: { type: "number", default: 161 },
            sshEnabled: { type: "boolean" },
            pollInterval: { type: "number" },
            isActive: { type: "boolean" },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const body = deviceSchema.parse(request.body);

      // If SNMPv3 credential ID is provided, verify it exists
      if (body.snmpv3CredentialId) {
        const credCheck = await pool.query(
          "SELECT id FROM npm.snmpv3_credentials WHERE id = $1",
          [body.snmpv3CredentialId],
        );
        if (credCheck.rows.length === 0) {
          reply.status(400);
          return {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "SNMPv3 credential not found",
            },
          };
        }
      }

      // If group ID is provided, verify it exists
      if (body.groupId) {
        const groupCheck = await pool.query(
          "SELECT id FROM npm.device_groups WHERE id = $1",
          [body.groupId],
        );
        if (groupCheck.rows.length === 0) {
          reply.status(400);
          return {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "Device group not found",
            },
          };
        }
      }

      const result = await pool.query(
        `INSERT INTO npm.devices (name, ip_address, device_type, vendor, model, group_id, poll_icmp, poll_snmp,
                                snmpv3_credential_id, snmp_port, ssh_enabled, poll_interval, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, name, ip_address, device_type, vendor, model, group_id, status,
                 poll_icmp, poll_snmp, snmpv3_credential_id, snmp_port,
                 ssh_enabled, poll_interval, is_active, created_at, updated_at`,
        [
          body.name,
          body.ipAddress,
          body.deviceType,
          body.vendor,
          body.model,
          body.groupId,
          body.pollIcmp,
          body.pollSnmp,
          body.snmpv3CredentialId,
          body.snmpPort,
          body.sshEnabled,
          body.pollInterval,
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
          deviceType: row.device_type,
          vendor: row.vendor,
          model: row.model,
          groupId: row.group_id,
          groupName: null,
          groupColor: null,
          status: row.status,
          pollIcmp: row.poll_icmp,
          pollSnmp: row.poll_snmp,
          snmpv3CredentialId: row.snmpv3_credential_id,
          snmpPort: row.snmp_port,
          sshEnabled: row.ssh_enabled,
          pollInterval: row.poll_interval,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Update device
  fastify.patch(
    "/devices/:id",
    {
      schema: {
        tags: ["NPM - Devices"],
        summary: "Update a monitored device",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
          },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            ipAddress: { type: "string" },
            deviceType: { type: "string" },
            vendor: { type: "string" },
            model: { type: "string" },
            groupId: { type: "string", format: "uuid", nullable: true },
            pollIcmp: { type: "boolean" },
            pollSnmp: { type: "boolean" },
            snmpv3CredentialId: {
              type: "string",
              format: "uuid",
              nullable: true,
            },
            snmpPort: { type: "number" },
            sshEnabled: { type: "boolean" },
            pollInterval: { type: "number" },
            isActive: { type: "boolean" },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateDeviceSchema.parse(request.body);

      // Check if device exists
      const existingResult = await pool.query(
        "SELECT id, poll_icmp, poll_snmp FROM npm.devices WHERE id = $1",
        [id],
      );

      if (existingResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Device not found" },
        };
      }

      // Validate polling methods
      const existing = existingResult.rows[0];
      const newPollIcmp = body.pollIcmp ?? existing.poll_icmp;
      const newPollSnmp = body.pollSnmp ?? existing.poll_snmp;

      if (!newPollIcmp && !newPollSnmp) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: "At least one polling method must be enabled",
          },
        };
      }

      // If SNMPv3 credential ID is provided, verify it exists
      if (body.snmpv3CredentialId) {
        const credCheck = await pool.query(
          "SELECT id FROM npm.snmpv3_credentials WHERE id = $1",
          [body.snmpv3CredentialId],
        );
        if (credCheck.rows.length === 0) {
          reply.status(400);
          return {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "SNMPv3 credential not found",
            },
          };
        }
      }

      // If group ID is provided (and not null), verify it exists
      if (body.groupId) {
        const groupCheck = await pool.query(
          "SELECT id FROM npm.device_groups WHERE id = $1",
          [body.groupId],
        );
        if (groupCheck.rows.length === 0) {
          reply.status(400);
          return {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "Device group not found",
            },
          };
        }
      }

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
      if (body.deviceType !== undefined) {
        updates.push(`device_type = $${paramIndex++}`);
        params.push(body.deviceType);
      }
      if (body.vendor !== undefined) {
        updates.push(`vendor = $${paramIndex++}`);
        params.push(body.vendor);
      }
      if (body.model !== undefined) {
        updates.push(`model = $${paramIndex++}`);
        params.push(body.model);
      }
      if (body.groupId !== undefined) {
        updates.push(`group_id = $${paramIndex++}`);
        params.push(body.groupId);
      }
      if (body.pollIcmp !== undefined) {
        updates.push(`poll_icmp = $${paramIndex++}`);
        params.push(body.pollIcmp);
      }
      if (body.pollSnmp !== undefined) {
        updates.push(`poll_snmp = $${paramIndex++}`);
        params.push(body.pollSnmp);
      }
      if (body.snmpv3CredentialId !== undefined) {
        updates.push(`snmpv3_credential_id = $${paramIndex++}`);
        params.push(body.snmpv3CredentialId);
      }
      if (body.snmpPort !== undefined) {
        updates.push(`snmp_port = $${paramIndex++}`);
        params.push(body.snmpPort);
      }
      if (body.sshEnabled !== undefined) {
        updates.push(`ssh_enabled = $${paramIndex++}`);
        params.push(body.sshEnabled);
      }
      if (body.pollInterval !== undefined) {
        updates.push(`poll_interval = $${paramIndex++}`);
        params.push(body.pollInterval);
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
        `UPDATE npm.devices
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, name, ip_address, device_type, vendor, model, status,
                 poll_icmp, poll_snmp, snmpv3_credential_id, snmp_port,
                 ssh_enabled, poll_interval, is_active, created_at, updated_at`,
        params,
      );

      const row = result.rows[0];
      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          ipAddress: row.ip_address,
          deviceType: row.device_type,
          vendor: row.vendor,
          model: row.model,
          status: row.status,
          pollIcmp: row.poll_icmp,
          pollSnmp: row.poll_snmp,
          snmpv3CredentialId: row.snmpv3_credential_id,
          snmpPort: row.snmp_port,
          sshEnabled: row.ssh_enabled,
          pollInterval: row.poll_interval,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Delete device
  fastify.delete(
    "/devices/:id",
    {
      schema: {
        tags: ["NPM - Devices"],
        summary: "Remove device from monitoring",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
          },
          required: ["id"],
        },
      },
      preHandler: [fastify.requireRole("admin")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const result = await pool.query(
        "DELETE FROM npm.devices WHERE id = $1 RETURNING id",
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Device not found" },
        };
      }

      return reply.status(204).send();
    },
  );

  // Poll device now (on-demand polling)
  fastify.post(
    "/devices/:id/poll",
    {
      schema: {
        tags: ["NPM - Devices"],
        summary: "Poll device now",
        description:
          "Trigger an immediate poll of the device using the specified methods (ICMP, SNMPv3, or both).",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
          },
          required: ["id"],
        },
        body: {
          type: "object",
          required: ["methods"],
          properties: {
            methods: {
              type: "array",
              items: { type: "string", enum: ["icmp", "snmp"] },
              minItems: 1,
              description: "Polling methods to use",
            },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = pollDeviceSchema.parse(request.body);

      // Fetch device with credential info
      const deviceResult = await pool.query(
        `SELECT d.id, d.name, d.ip_address, d.poll_icmp, d.poll_snmp,
                d.snmpv3_credential_id, d.snmp_port, d.is_active,
                c.username as snmp_username, c.security_level, c.auth_protocol, c.priv_protocol,
                c.auth_password_encrypted, c.priv_password_encrypted
         FROM npm.devices d
         LEFT JOIN npm.snmpv3_credentials c ON d.snmpv3_credential_id = c.id
         WHERE d.id = $1`,
        [id],
      );

      if (deviceResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Device not found" },
        };
      }

      const device = deviceResult.rows[0];

      if (!device.is_active) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: "Cannot poll inactive device",
          },
        };
      }

      // Validate requested methods against device capabilities
      const wantsIcmp = body.methods.includes("icmp");
      const wantsSnmp = body.methods.includes("snmp");

      if (wantsIcmp && !device.poll_icmp) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: "ICMP polling is not enabled for this device",
          },
        };
      }

      if (wantsSnmp && !device.poll_snmp) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: "SNMP polling is not enabled for this device",
          },
        };
      }

      if (wantsSnmp && !device.snmpv3_credential_id) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: "SNMPv3 credential not configured for this device",
          },
        };
      }

      const pollResults: {
        icmp?: {
          success: boolean;
          latencyMs?: number;
          error?: string;
        };
        snmp?: {
          success: boolean;
          cpuPercent?: number;
          memoryPercent?: number;
          uptimeSeconds?: number;
          error?: string;
        };
      } = {};

      // Perform ICMP poll
      if (wantsIcmp) {
        try {
          const { spawn } = await import("child_process");
          const isWindows = process.platform === "win32";
          const pingArgs = isWindows
            ? ["-n", "1", "-w", "2000", device.ip_address]
            : ["-c", "1", "-W", "2", device.ip_address];
          const pingCmd = isWindows ? "ping" : "ping";

          const pingStartTime = Date.now();
          const pingResult = await new Promise<{
            success: boolean;
            latencyMs?: number;
          }>((resolve) => {
            const ping = spawn(pingCmd, pingArgs);
            let stdout = "";

            ping.stdout.on("data", (data: Buffer) => {
              stdout += data.toString();
            });

            ping.on("close", (code: number) => {
              const latencyMs = Date.now() - pingStartTime;
              if (code === 0) {
                // Parse latency from output
                const timeMatch = stdout.match(/time[=<](\d+(?:\.\d+)?)\s*ms/i);
                const parsedLatency =
                  timeMatch && timeMatch[1]
                    ? parseFloat(timeMatch[1])
                    : latencyMs;
                resolve({ success: true, latencyMs: parsedLatency });
              } else {
                resolve({ success: false });
              }
            });

            ping.on("error", () => {
              resolve({ success: false });
            });

            // Timeout after 5 seconds
            setTimeout(() => {
              ping.kill();
              resolve({ success: false });
            }, 5000);
          });

          pollResults.icmp = pingResult.success
            ? { success: true, latencyMs: pingResult.latencyMs }
            : { success: false, error: "Host unreachable" };

          // Update device status
          const newIcmpStatus = pingResult.success ? "up" : "down";
          await pool.query(
            `UPDATE npm.devices
             SET icmp_status = $1::varchar, last_icmp_poll = NOW(),
                 status = CASE
                   WHEN $1::varchar = 'up' THEN 'up'
                   WHEN snmp_status = 'up' THEN 'up'
                   ELSE 'down'
                 END,
                 last_poll = NOW()
             WHERE id = $2`,
            [newIcmpStatus, id],
          );

          // Insert metrics record
          const isReachable = pingResult.success === true;
          await pool.query(
            `INSERT INTO npm.device_metrics (device_id, icmp_latency_ms, icmp_reachable, is_available, collected_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [id, pingResult.latencyMs || null, isReachable, isReachable],
          );
        } catch (err) {
          logger.error({ err, deviceId: id }, "ICMP poll error");
          pollResults.icmp = {
            success: false,
            error: err instanceof Error ? err.message : "ICMP poll failed",
          };
        }
      }

      // Perform SNMP poll (placeholder - actual SNMPv3 implementation would require pysnmp or similar)
      if (wantsSnmp) {
        // For now, we'll update the SNMP status to indicate a poll was attempted
        // A real implementation would use a Python service or native SNMP library
        try {
          // Update last SNMP poll time
          await pool.query(
            `UPDATE npm.devices
             SET last_snmp_poll = NOW(), last_poll = NOW()
             WHERE id = $1`,
            [id],
          );

          pollResults.snmp = {
            success: true,
            cpuPercent: undefined,
            memoryPercent: undefined,
            uptimeSeconds: undefined,
          };

          logger.info(
            { deviceId: id, ipAddress: device.ip_address },
            "SNMPv3 poll triggered (requires Python collector service)",
          );
        } catch (err) {
          logger.error({ err, deviceId: id }, "SNMP poll error");
          pollResults.snmp = {
            success: false,
            error: err instanceof Error ? err.message : "SNMP poll failed",
          };
        }
      }

      // Fetch updated device data
      const updatedResult = await pool.query(
        `SELECT d.id, d.name, d.ip_address, d.status, d.icmp_status, d.snmp_status,
                d.last_poll, d.last_icmp_poll, d.last_snmp_poll
         FROM npm.devices d
         WHERE d.id = $1`,
        [id],
      );

      const updatedDevice = updatedResult.rows[0];

      return {
        success: true,
        data: {
          deviceId: id,
          deviceName: device.name,
          ipAddress: device.ip_address,
          polledAt: new Date().toISOString(),
          methods: body.methods,
          results: pollResults,
          deviceStatus: {
            status: updatedDevice.status,
            icmpStatus: updatedDevice.icmp_status,
            snmpStatus: updatedDevice.snmp_status,
            lastPoll: updatedDevice.last_poll,
            lastIcmpPoll: updatedDevice.last_icmp_poll,
            lastSnmpPoll: updatedDevice.last_snmp_poll,
          },
        },
      };
    },
  );

  // Get device metrics history (time series)
  fastify.get(
    "/devices/:id/metrics",
    {
      schema: {
        tags: ["NPM - Metrics"],
        summary: "Get historical metrics for a device",
        description:
          "Returns time-series metrics including CPU, memory, latency, and availability.",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
          },
          required: ["id"],
        },
        querystring: {
          type: "object",
          properties: {
            startTime: { type: "string", format: "date-time" },
            endTime: { type: "string", format: "date-time" },
            metricType: {
              type: "string",
              enum: [
                "cpu",
                "memory",
                "bandwidth",
                "latency",
                "packet_loss",
                "all",
              ],
            },
            interval: {
              type: "string",
              enum: ["1m", "5m", "15m", "1h", "6h", "1d"],
              default: "5m",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = metricsQuerySchema.parse(request.query);

      // Verify device exists
      const deviceResult = await pool.query(
        "SELECT id, name FROM npm.devices WHERE id = $1",
        [id],
      );

      if (deviceResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Device not found" },
        };
      }

      // Default to last 24 hours
      const endTime = query.endTime || new Date();
      const startTime =
        query.startTime || new Date(endTime.getTime() - 24 * 3600000);

      // Get metrics from database
      const metricsResult = await pool.query(
        `SELECT
          collected_at,
          icmp_latency_ms,
          icmp_packet_loss_percent,
          icmp_reachable,
          cpu_utilization_percent,
          memory_utilization_percent,
          memory_total_bytes,
          memory_used_bytes,
          uptime_seconds,
          total_interfaces,
          interfaces_up,
          interfaces_down,
          is_available
        FROM npm.device_metrics
        WHERE device_id = $1
          AND collected_at >= $2
          AND collected_at <= $3
        ORDER BY collected_at ASC
        LIMIT 1000`,
        [id, startTime, endTime],
      );

      // Transform to time-series format
      const metrics = metricsResult.rows.map((row) => ({
        timestamp: row.collected_at,
        latencyMs: row.icmp_latency_ms ? parseFloat(row.icmp_latency_ms) : null,
        packetLossPercent: row.icmp_packet_loss_percent
          ? parseFloat(row.icmp_packet_loss_percent)
          : null,
        icmpReachable: row.icmp_reachable,
        cpuPercent: row.cpu_utilization_percent
          ? parseFloat(row.cpu_utilization_percent)
          : null,
        memoryPercent: row.memory_utilization_percent
          ? parseFloat(row.memory_utilization_percent)
          : null,
        memoryTotalBytes: row.memory_total_bytes
          ? parseInt(row.memory_total_bytes, 10)
          : null,
        memoryUsedBytes: row.memory_used_bytes
          ? parseInt(row.memory_used_bytes, 10)
          : null,
        uptimeSeconds: row.uptime_seconds
          ? parseInt(row.uptime_seconds, 10)
          : null,
        totalInterfaces: row.total_interfaces,
        interfacesUp: row.interfaces_up,
        interfacesDown: row.interfaces_down,
        isAvailable: row.is_available,
      }));

      return {
        success: true,
        data: {
          deviceId: id,
          deviceName: deviceResult.rows[0].name,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          pointCount: metrics.length,
          metrics,
        },
      };
    },
  );

  // Get current/latest device metrics
  fastify.get(
    "/devices/:id/metrics/current",
    {
      schema: {
        tags: ["NPM - Metrics"],
        summary: "Get current metrics for a device",
        description:
          "Returns the most recent metrics snapshot for a device including CPU, memory, latency, and availability.",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
          },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Verify device exists and get basic info
      const deviceResult = await pool.query(
        `SELECT d.id, d.name, d.ip_address, d.device_type, d.vendor, d.model,
                d.status, d.icmp_status, d.snmp_status, d.last_poll,
                d.poll_icmp, d.poll_snmp
         FROM npm.devices d
         WHERE d.id = $1`,
        [id],
      );

      if (deviceResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Device not found" },
        };
      }

      const device = deviceResult.rows[0];

      // Get most recent metrics
      const metricsResult = await pool.query(
        `SELECT
          collected_at,
          icmp_latency_ms,
          icmp_packet_loss_percent,
          icmp_reachable,
          cpu_utilization_percent,
          memory_utilization_percent,
          memory_total_bytes,
          memory_used_bytes,
          uptime_seconds,
          temperature_celsius,
          total_interfaces,
          interfaces_up,
          interfaces_down,
          is_available
        FROM npm.device_metrics
        WHERE device_id = $1
        ORDER BY collected_at DESC
        LIMIT 1`,
        [id],
      );

      // Get availability stats for last 24 hours
      const availabilityResult = await pool.query(
        `SELECT
          COUNT(*) as total_polls,
          COUNT(*) FILTER (WHERE is_available = true) as successful_polls,
          AVG(icmp_latency_ms) as avg_latency,
          MIN(icmp_latency_ms) as min_latency,
          MAX(icmp_latency_ms) as max_latency,
          AVG(cpu_utilization_percent) as avg_cpu,
          MAX(cpu_utilization_percent) as max_cpu,
          AVG(memory_utilization_percent) as avg_memory,
          MAX(memory_utilization_percent) as max_memory
        FROM npm.device_metrics
        WHERE device_id = $1
          AND collected_at >= NOW() - INTERVAL '24 hours'`,
        [id],
      );

      const latestMetrics = metricsResult.rows[0] || null;
      const availability = availabilityResult.rows[0];

      // Calculate availability percentage
      const totalPolls = parseInt(availability.total_polls, 10) || 0;
      const successfulPolls = parseInt(availability.successful_polls, 10) || 0;
      const availabilityPercent =
        totalPolls > 0 ? (successfulPolls / totalPolls) * 100 : null;

      // Format uptime
      const formatUptime = (seconds: number | null): string | null => {
        if (seconds === null) return null;
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (days > 0) {
          return `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
          return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
      };

      return {
        success: true,
        data: {
          deviceId: id,
          deviceName: device.name,
          ipAddress: device.ip_address,
          deviceType: device.device_type,
          vendor: device.vendor,
          model: device.model,
          status: device.status,
          icmpStatus: device.icmp_status,
          snmpStatus: device.snmp_status,
          lastPoll: device.last_poll,
          pollMethods: {
            icmp: device.poll_icmp,
            snmp: device.poll_snmp,
          },
          current: latestMetrics
            ? {
                collectedAt: latestMetrics.collected_at,
                latencyMs: latestMetrics.icmp_latency_ms
                  ? parseFloat(latestMetrics.icmp_latency_ms)
                  : null,
                packetLossPercent: latestMetrics.icmp_packet_loss_percent
                  ? parseFloat(latestMetrics.icmp_packet_loss_percent)
                  : null,
                cpuPercent: latestMetrics.cpu_utilization_percent
                  ? parseFloat(latestMetrics.cpu_utilization_percent)
                  : null,
                memoryPercent: latestMetrics.memory_utilization_percent
                  ? parseFloat(latestMetrics.memory_utilization_percent)
                  : null,
                memoryTotalBytes: latestMetrics.memory_total_bytes
                  ? parseInt(latestMetrics.memory_total_bytes, 10)
                  : null,
                memoryUsedBytes: latestMetrics.memory_used_bytes
                  ? parseInt(latestMetrics.memory_used_bytes, 10)
                  : null,
                temperatureCelsius: latestMetrics.temperature_celsius
                  ? parseFloat(latestMetrics.temperature_celsius)
                  : null,
                uptimeSeconds: latestMetrics.uptime_seconds
                  ? parseInt(latestMetrics.uptime_seconds, 10)
                  : null,
                uptimeFormatted: formatUptime(
                  latestMetrics.uptime_seconds
                    ? parseInt(latestMetrics.uptime_seconds, 10)
                    : null,
                ),
                totalInterfaces: latestMetrics.total_interfaces,
                interfacesUp: latestMetrics.interfaces_up,
                interfacesDown: latestMetrics.interfaces_down,
                isAvailable: latestMetrics.is_available,
              }
            : null,
          last24Hours: {
            availabilityPercent: availabilityPercent
              ? parseFloat(availabilityPercent.toFixed(2))
              : null,
            totalPolls,
            successfulPolls,
            avgLatencyMs: availability.avg_latency
              ? parseFloat(parseFloat(availability.avg_latency).toFixed(2))
              : null,
            minLatencyMs: availability.min_latency
              ? parseFloat(parseFloat(availability.min_latency).toFixed(2))
              : null,
            maxLatencyMs: availability.max_latency
              ? parseFloat(parseFloat(availability.max_latency).toFixed(2))
              : null,
            avgCpuPercent: availability.avg_cpu
              ? parseFloat(parseFloat(availability.avg_cpu).toFixed(1))
              : null,
            maxCpuPercent: availability.max_cpu
              ? parseFloat(parseFloat(availability.max_cpu).toFixed(1))
              : null,
            avgMemoryPercent: availability.avg_memory
              ? parseFloat(parseFloat(availability.avg_memory).toFixed(1))
              : null,
            maxMemoryPercent: availability.max_memory
              ? parseFloat(parseFloat(availability.max_memory).toFixed(1))
              : null,
          },
        },
      };
    },
  );

  // List alerts
  fastify.get(
    "/alerts",
    {
      schema: {
        tags: ["NPM - Alerts"],
        summary: "List active alerts",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            page: { type: "number", minimum: 1, default: 1 },
            limit: { type: "number", minimum: 1, maximum: 100, default: 20 },
            severity: { type: "string", enum: ["critical", "warning", "info"] },
            status: {
              type: "string",
              enum: ["active", "acknowledged", "resolved"],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const query = querySchema.parse(request.query);
      const offset = (query.page - 1) * query.limit;

      const result = await pool.query(
        `SELECT a.id, a.device_id, d.name as device_name, a.severity, a.message, a.status,
              a.details, a.acknowledged_by, a.acknowledged_at, a.triggered_at, a.resolved_at
       FROM npm.alerts a
       LEFT JOIN npm.devices d ON a.device_id = d.id
       WHERE a.status = 'active'
       ORDER BY
         CASE a.severity
           WHEN 'critical' THEN 1
           WHEN 'warning' THEN 2
           ELSE 3
         END,
         a.triggered_at DESC
       LIMIT $1 OFFSET $2`,
        [query.limit, offset],
      );

      return {
        success: true,
        data: result.rows.map((row) => ({
          id: row.id,
          deviceId: row.device_id,
          deviceName: row.device_name,
          severity: row.severity,
          message: row.message,
          status: row.status,
          details: row.details,
          acknowledgedBy: row.acknowledged_by,
          acknowledgedAt: row.acknowledged_at,
          triggeredAt: row.triggered_at,
          resolvedAt: row.resolved_at,
        })),
      };
    },
  );

  // ============================================================
  // INTERFACES - Device interface management
  // ============================================================

  // List device interfaces
  fastify.get(
    "/devices/:id/interfaces",
    {
      schema: {
        tags: ["NPM - Interfaces"],
        summary: "List interfaces for a device",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
          },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Verify device exists
      const deviceResult = await pool.query(
        "SELECT id, name FROM npm.devices WHERE id = $1",
        [id],
      );

      if (deviceResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Device not found" },
        };
      }

      const result = await pool.query(
        `SELECT id, device_id, if_index, name, description, mac_address,
                ip_addresses, speed_mbps, admin_status, oper_status,
                is_monitored, created_at, updated_at
         FROM npm.interfaces
         WHERE device_id = $1
         ORDER BY if_index`,
        [id],
      );

      return {
        success: true,
        data: {
          deviceId: id,
          deviceName: deviceResult.rows[0].name,
          interfaces: result.rows.map((row) => ({
            id: row.id,
            ifIndex: row.if_index,
            name: row.name,
            description: row.description,
            macAddress: row.mac_address,
            ipAddresses: row.ip_addresses,
            speedMbps: row.speed_mbps ? parseInt(row.speed_mbps, 10) : null,
            adminStatus: row.admin_status,
            operStatus: row.oper_status,
            isMonitored: row.is_monitored,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })),
          totalCount: result.rows.length,
        },
      };
    },
  );

  // Get interface metrics
  fastify.get(
    "/interfaces/:id/metrics",
    {
      schema: {
        tags: ["NPM - Interfaces"],
        summary: "Get metrics for an interface",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
          },
          required: ["id"],
        },
        querystring: {
          type: "object",
          properties: {
            startTime: { type: "string", format: "date-time" },
            endTime: { type: "string", format: "date-time" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = metricsQuerySchema.parse(request.query);

      // Verify interface exists
      const interfaceResult = await pool.query(
        `SELECT i.id, i.name, i.if_index, d.name as device_name
         FROM npm.interfaces i
         JOIN npm.devices d ON i.device_id = d.id
         WHERE i.id = $1`,
        [id],
      );

      if (interfaceResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Interface not found" },
        };
      }

      // Default to last 24 hours
      const endTime = query.endTime || new Date();
      const startTime =
        query.startTime || new Date(endTime.getTime() - 24 * 3600000);

      const metricsResult = await pool.query(
        `SELECT collected_at, in_octets, out_octets, in_packets, out_packets,
                in_errors, out_errors, in_discards, out_discards,
                in_octets_rate, out_octets_rate,
                utilization_in_percent, utilization_out_percent,
                admin_status, oper_status
         FROM npm.interface_metrics
         WHERE interface_id = $1
           AND collected_at >= $2
           AND collected_at <= $3
         ORDER BY collected_at ASC
         LIMIT 1000`,
        [id, startTime, endTime],
      );

      const iface = interfaceResult.rows[0];
      return {
        success: true,
        data: {
          interfaceId: id,
          interfaceName: iface.name,
          ifIndex: iface.if_index,
          deviceName: iface.device_name,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          pointCount: metricsResult.rows.length,
          metrics: metricsResult.rows.map((row) => ({
            timestamp: row.collected_at,
            inOctets: row.in_octets ? parseInt(row.in_octets, 10) : null,
            outOctets: row.out_octets ? parseInt(row.out_octets, 10) : null,
            inPackets: row.in_packets ? parseInt(row.in_packets, 10) : null,
            outPackets: row.out_packets ? parseInt(row.out_packets, 10) : null,
            inErrors: row.in_errors ? parseInt(row.in_errors, 10) : null,
            outErrors: row.out_errors ? parseInt(row.out_errors, 10) : null,
            inDiscards: row.in_discards ? parseInt(row.in_discards, 10) : null,
            outDiscards: row.out_discards
              ? parseInt(row.out_discards, 10)
              : null,
            inOctetsRate: row.in_octets_rate
              ? parseFloat(row.in_octets_rate)
              : null,
            outOctetsRate: row.out_octets_rate
              ? parseFloat(row.out_octets_rate)
              : null,
            utilizationInPercent: row.utilization_in_percent
              ? parseFloat(row.utilization_in_percent)
              : null,
            utilizationOutPercent: row.utilization_out_percent
              ? parseFloat(row.utilization_out_percent)
              : null,
            adminStatus: row.admin_status,
            operStatus: row.oper_status,
          })),
        },
      };
    },
  );

  // ============================================================
  // VOLUMES - Device storage/volume management
  // ============================================================

  // List device volumes
  fastify.get(
    "/devices/:id/volumes",
    {
      schema: {
        tags: ["NPM - Volumes"],
        summary: "List storage volumes for a device",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
          },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Verify device exists
      const deviceResult = await pool.query(
        "SELECT id, name FROM npm.devices WHERE id = $1",
        [id],
      );

      if (deviceResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Device not found" },
        };
      }

      const result = await pool.query(
        `SELECT id, device_id, volume_index, name, description, type,
                mount_point, total_bytes, used_bytes, is_monitored,
                created_at, updated_at
         FROM npm.volumes
         WHERE device_id = $1
         ORDER BY volume_index`,
        [id],
      );

      return {
        success: true,
        data: {
          deviceId: id,
          deviceName: deviceResult.rows[0].name,
          volumes: result.rows.map((row) => {
            const totalBytes = row.total_bytes
              ? parseInt(row.total_bytes, 10)
              : null;
            const usedBytes = row.used_bytes
              ? parseInt(row.used_bytes, 10)
              : null;
            const availableBytes =
              totalBytes !== null && usedBytes !== null
                ? totalBytes - usedBytes
                : null;
            const utilizationPercent =
              totalBytes !== null && usedBytes !== null && totalBytes > 0
                ? (usedBytes / totalBytes) * 100
                : null;

            return {
              id: row.id,
              volumeIndex: row.volume_index,
              name: row.name,
              description: row.description,
              type: row.type,
              mountPoint: row.mount_point,
              totalBytes,
              usedBytes,
              availableBytes,
              utilizationPercent: utilizationPercent
                ? parseFloat(utilizationPercent.toFixed(2))
                : null,
              isMonitored: row.is_monitored,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            };
          }),
          totalCount: result.rows.length,
        },
      };
    },
  );

  // Get volume metrics
  fastify.get(
    "/volumes/:id/metrics",
    {
      schema: {
        tags: ["NPM - Volumes"],
        summary: "Get metrics history for a volume",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
          },
          required: ["id"],
        },
        querystring: {
          type: "object",
          properties: {
            startTime: { type: "string", format: "date-time" },
            endTime: { type: "string", format: "date-time" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = metricsQuerySchema.parse(request.query);

      // Verify volume exists
      const volumeResult = await pool.query(
        `SELECT v.id, v.name, v.volume_index, v.mount_point, d.name as device_name
         FROM npm.volumes v
         JOIN npm.devices d ON v.device_id = d.id
         WHERE v.id = $1`,
        [id],
      );

      if (volumeResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Volume not found" },
        };
      }

      // Default to last 24 hours
      const endTime = query.endTime || new Date();
      const startTime =
        query.startTime || new Date(endTime.getTime() - 24 * 3600000);

      const metricsResult = await pool.query(
        `SELECT collected_at, total_bytes, used_bytes, available_bytes,
                utilization_percent
         FROM npm.volume_metrics
         WHERE volume_id = $1
           AND collected_at >= $2
           AND collected_at <= $3
         ORDER BY collected_at ASC
         LIMIT 1000`,
        [id, startTime, endTime],
      );

      const volume = volumeResult.rows[0];
      return {
        success: true,
        data: {
          volumeId: id,
          volumeName: volume.name,
          volumeIndex: volume.volume_index,
          mountPoint: volume.mount_point,
          deviceName: volume.device_name,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          pointCount: metricsResult.rows.length,
          metrics: metricsResult.rows.map((row) => ({
            timestamp: row.collected_at,
            totalBytes: row.total_bytes ? parseInt(row.total_bytes, 10) : null,
            usedBytes: row.used_bytes ? parseInt(row.used_bytes, 10) : null,
            availableBytes: row.available_bytes
              ? parseInt(row.available_bytes, 10)
              : null,
            utilizationPercent: row.utilization_percent
              ? parseFloat(row.utilization_percent)
              : null,
          })),
        },
      };
    },
  );

  // ============================================================
  // DASHBOARD - Summary statistics (optimized for 3000+ devices)
  // ============================================================

  // NPM Dashboard with summary statistics
  fastify.get(
    "/dashboard",
    {
      schema: {
        tags: ["NPM - Dashboard"],
        summary: "Get NPM dashboard statistics",
        description:
          "Returns summary statistics optimized for large device counts (3000+)",
        security: [{ bearerAuth: [] }],
      },
    },
    async () => {
      // Get device counts by status (optimized single query)
      const deviceStatsResult = await pool.query(`
        SELECT
          COUNT(*) as total_devices,
          COUNT(*) FILTER (WHERE is_active) as active_devices,
          COUNT(*) FILTER (WHERE status = 'up') as devices_up,
          COUNT(*) FILTER (WHERE status = 'down') as devices_down,
          COUNT(*) FILTER (WHERE status = 'unknown') as devices_unknown,
          COUNT(*) FILTER (WHERE poll_icmp) as icmp_enabled,
          COUNT(*) FILTER (WHERE poll_snmp) as snmp_enabled
        FROM npm.devices
      `);

      // Get interface/volume counts
      const componentStatsResult = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM npm.interfaces) as total_interfaces,
          (SELECT COUNT(*) FROM npm.interfaces WHERE oper_status = 'up') as interfaces_up,
          (SELECT COUNT(*) FROM npm.volumes) as total_volumes
      `);

      // Get recent alert counts
      const alertStatsResult = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') as active_alerts,
          COUNT(*) FILTER (WHERE status = 'active' AND severity = 'critical') as critical_alerts,
          COUNT(*) FILTER (WHERE status = 'active' AND severity = 'warning') as warning_alerts
        FROM npm.alerts
      `);

      // Get availability stats for last 24 hours (aggregate query)
      const availabilityResult = await pool.query(`
        SELECT
          AVG(CASE WHEN is_available THEN 100.0 ELSE 0 END) as avg_availability
        FROM npm.device_metrics
        WHERE collected_at >= NOW() - INTERVAL '24 hours'
      `);

      const deviceStats = deviceStatsResult.rows[0];
      const componentStats = componentStatsResult.rows[0];
      const alertStats = alertStatsResult.rows[0];
      const availability = availabilityResult.rows[0];

      return {
        success: true,
        data: {
          devices: {
            total: parseInt(deviceStats.total_devices, 10),
            active: parseInt(deviceStats.active_devices, 10),
            up: parseInt(deviceStats.devices_up, 10),
            down: parseInt(deviceStats.devices_down, 10),
            unknown: parseInt(deviceStats.devices_unknown, 10),
            icmpEnabled: parseInt(deviceStats.icmp_enabled, 10),
            snmpEnabled: parseInt(deviceStats.snmp_enabled, 10),
          },
          interfaces: {
            total: parseInt(componentStats.total_interfaces, 10),
            up: parseInt(componentStats.interfaces_up, 10),
          },
          volumes: {
            total: parseInt(componentStats.total_volumes, 10),
          },
          alerts: {
            active: parseInt(alertStats.active_alerts, 10),
            critical: parseInt(alertStats.critical_alerts, 10),
            warning: parseInt(alertStats.warning_alerts, 10),
          },
          health: {
            averageAvailability24h: availability.avg_availability
              ? parseFloat(parseFloat(availability.avg_availability).toFixed(2))
              : null,
          },
        },
      };
    },
  );

  // Bulk device status endpoint (for monitoring views)
  fastify.get(
    "/devices/status",
    {
      schema: {
        tags: ["NPM - Devices"],
        summary: "Get status summary for all devices",
        description:
          "Lightweight endpoint returning only status information for efficient dashboard updates",
        security: [{ bearerAuth: [] }],
      },
    },
    async () => {
      const result = await pool.query(`
        SELECT id, name, ip_address, status, icmp_status, snmp_status, last_poll
        FROM npm.devices
        WHERE is_active = true
        ORDER BY name
      `);

      return {
        success: true,
        data: result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          ipAddress: row.ip_address,
          status: row.status,
          icmpStatus: row.icmp_status,
          snmpStatus: row.snmp_status,
          lastPoll: row.last_poll,
        })),
        totalCount: result.rows.length,
      };
    },
  );
};

export default npmRoutes;
