/**
 * GridWatch NetEnterprise - NPM Discovery API Routes
 *
 * Network discovery endpoints for scanning networks and discovering devices
 * using ICMP ping and SNMPv3 queries.
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { pool } from "../../db";
import { logger } from "../../logger";

// Zod schemas
const startDiscoverySchema = z
  .object({
    name: z.string().min(1).max(255),
    cidr: z
      .string()
      .regex(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/, "Invalid CIDR notation"),
    discoveryMethod: z.enum(["icmp", "snmpv3", "both"]),
    snmpv3CredentialId: z.string().uuid().optional(),
    site: z.string().max(255).optional(),
  })
  .refine(
    (data) => {
      if (
        data.discoveryMethod === "snmpv3" ||
        data.discoveryMethod === "both"
      ) {
        return !!data.snmpv3CredentialId;
      }
      return true;
    },
    { message: "SNMPv3 credential is required when using SNMPv3 discovery" },
  );

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(["pending", "running", "completed", "failed", "cancelled"])
    .optional(),
});

const addHostsSchema = z.object({
  hostIds: z.array(z.string().uuid()).min(1),
  pollIcmp: z.boolean().default(true),
  pollSnmp: z.boolean().default(false),
  snmpv3CredentialId: z.string().uuid().optional(),
  pollInterval: z.number().int().min(30).max(3600).default(60),
});

const updateHostsSiteSchema = z.object({
  hostIds: z.array(z.string().uuid()).min(1),
  site: z.string().max(255).nullable(),
});

const discoveryRoutes: FastifyPluginAsync = async (fastify) => {
  // Require authentication for all discovery routes
  fastify.addHook("preHandler", fastify.requireAuth);

  // List discovery jobs
  fastify.get(
    "/jobs",
    {
      schema: {
        tags: ["NPM - Discovery"],
        summary: "List discovery jobs",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            page: { type: "number", minimum: 1, default: 1 },
            limit: { type: "number", minimum: 1, maximum: 100, default: 20 },
            status: {
              type: "string",
              enum: ["pending", "running", "completed", "failed", "cancelled"],
            },
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

      if (query.status) {
        conditions.push(`j.status = $${paramIndex}`);
        params.push(query.status);
        paramIndex++;
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const [countResult, dataResult] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) FROM npm.discovery_jobs j ${whereClause}`,
          params.slice(2),
        ),
        pool.query(
          `SELECT j.id, j.name, j.cidr, j.discovery_method, j.snmpv3_credential_id,
                  c.name as snmpv3_credential_name, j.site, j.status, j.progress_percent,
                  j.total_hosts, j.discovered_hosts, j.error_message,
                  j.started_at, j.completed_at, j.created_at, j.updated_at,
                  u.username as created_by_username
           FROM npm.discovery_jobs j
           LEFT JOIN npm.snmpv3_credentials c ON j.snmpv3_credential_id = c.id
           LEFT JOIN shared.users u ON j.created_by = u.id
           ${whereClause}
           ORDER BY j.created_at DESC
           LIMIT $1 OFFSET $2`,
          params,
        ),
      ]);

      return {
        success: true,
        data: dataResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          cidr: row.cidr,
          discoveryMethod: row.discovery_method,
          snmpv3CredentialId: row.snmpv3_credential_id,
          snmpv3CredentialName: row.snmpv3_credential_name,
          site: row.site,
          status: row.status,
          progressPercent: row.progress_percent,
          totalHosts: row.total_hosts,
          discoveredHosts: row.discovered_hosts,
          errorMessage: row.error_message,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          createdByUsername: row.created_by_username,
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

  // Get discovery job by ID
  fastify.get(
    "/jobs/:id",
    {
      schema: {
        tags: ["NPM - Discovery"],
        summary: "Get discovery job details",
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
        `SELECT j.id, j.name, j.cidr, j.discovery_method, j.snmpv3_credential_id,
                c.name as snmpv3_credential_name, j.site, j.status, j.progress_percent,
                j.total_hosts, j.discovered_hosts, j.error_message,
                j.started_at, j.completed_at, j.created_at, j.updated_at,
                u.username as created_by_username
         FROM npm.discovery_jobs j
         LEFT JOIN npm.snmpv3_credentials c ON j.snmpv3_credential_id = c.id
         LEFT JOIN shared.users u ON j.created_by = u.id
         WHERE j.id = $1`,
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Discovery job not found" },
        };
      }

      const row = result.rows[0];
      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          cidr: row.cidr,
          discoveryMethod: row.discovery_method,
          snmpv3CredentialId: row.snmpv3_credential_id,
          snmpv3CredentialName: row.snmpv3_credential_name,
          site: row.site,
          status: row.status,
          progressPercent: row.progress_percent,
          totalHosts: row.total_hosts,
          discoveredHosts: row.discovered_hosts,
          errorMessage: row.error_message,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          createdByUsername: row.created_by_username,
        },
      };
    },
  );

  // Start new discovery job
  fastify.post(
    "/jobs",
    {
      schema: {
        tags: ["NPM - Discovery"],
        summary: "Start a new network discovery job",
        description:
          "Scan a network range using ICMP ping and/or SNMPv3 to discover devices.",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["name", "cidr", "discoveryMethod"],
          properties: {
            name: { type: "string" },
            cidr: {
              type: "string",
              description: "Network in CIDR notation (e.g., 192.168.1.0/24)",
            },
            discoveryMethod: {
              type: "string",
              enum: ["icmp", "snmpv3", "both"],
            },
            snmpv3CredentialId: { type: "string", format: "uuid" },
            site: {
              type: "string",
              description: "Site name to assign to all discovered hosts",
            },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const body = startDiscoverySchema.parse(request.body);
      const user = request.user!;

      // Verify SNMPv3 credential exists if specified
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

      // Calculate total hosts from CIDR
      const cidrParts = body.cidr.split("/");
      const maskBits = parseInt(cidrParts[1] || "24", 10);
      const totalHosts = Math.pow(2, 32 - maskBits) - 2; // Exclude network and broadcast

      if (totalHosts > 65534) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message:
              "Network range too large. Maximum /16 (65,534 hosts) allowed.",
          },
        };
      }

      // Create discovery job
      const result = await pool.query(
        `INSERT INTO npm.discovery_jobs (name, cidr, discovery_method, snmpv3_credential_id, site, total_hosts, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, cidr, discovery_method, snmpv3_credential_id, site, status,
                   progress_percent, total_hosts, discovered_hosts, created_at`,
        [
          body.name,
          body.cidr,
          body.discoveryMethod,
          body.snmpv3CredentialId,
          body.site,
          totalHosts,
          user.sub,
        ],
      );

      const row = result.rows[0];

      // TODO: Trigger actual discovery via NATS message to NPM discovery collector
      // For now, we'll handle discovery in the Python service that polls for pending jobs
      logger.info("discovery_job_created", {
        jobId: row.id,
        cidr: body.cidr,
        method: body.discoveryMethod,
        site: body.site,
      });

      reply.status(201);
      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          cidr: row.cidr,
          discoveryMethod: row.discovery_method,
          snmpv3CredentialId: row.snmpv3_credential_id,
          site: row.site,
          status: row.status,
          progressPercent: row.progress_percent,
          totalHosts: row.total_hosts,
          discoveredHosts: row.discovered_hosts,
          createdAt: row.created_at,
        },
      };
    },
  );

  // Cancel discovery job
  fastify.post(
    "/jobs/:id/cancel",
    {
      schema: {
        tags: ["NPM - Discovery"],
        summary: "Cancel a running discovery job",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
          },
          required: ["id"],
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const result = await pool.query(
        `UPDATE npm.discovery_jobs
         SET status = 'cancelled', completed_at = NOW()
         WHERE id = $1 AND status IN ('pending', 'running')
         RETURNING id, status`,
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Discovery job not found or already completed",
          },
        };
      }

      return {
        success: true,
        data: { id: result.rows[0].id, status: "cancelled" },
      };
    },
  );

  // Delete discovery job
  fastify.delete(
    "/jobs/:id",
    {
      schema: {
        tags: ["NPM - Discovery"],
        summary: "Delete a discovery job and its results",
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

      // Don't allow deletion of running jobs
      const statusCheck = await pool.query(
        "SELECT status FROM npm.discovery_jobs WHERE id = $1",
        [id],
      );

      if (statusCheck.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Discovery job not found" },
        };
      }

      if (statusCheck.rows[0].status === "running") {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: "Cannot delete running job. Cancel it first.",
          },
        };
      }

      await pool.query("DELETE FROM npm.discovery_jobs WHERE id = $1", [id]);

      return reply.status(204).send();
    },
  );

  // Get discovered hosts for a job
  fastify.get(
    "/jobs/:id/hosts",
    {
      schema: {
        tags: ["NPM - Discovery"],
        summary: "Get discovered hosts for a discovery job",
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
            page: { type: "number", minimum: 1, default: 1 },
            limit: { type: "number", minimum: 1, maximum: 100, default: 50 },
            reachable: { type: "boolean" },
            added: { type: "boolean" },
            site: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          reachable: z.coerce.boolean().optional(),
          added: z.coerce.boolean().optional(),
          site: z.string().optional(),
        })
        .parse(request.query);

      const offset = (query.page - 1) * query.limit;

      // Verify job exists
      const jobCheck = await pool.query(
        "SELECT id FROM npm.discovery_jobs WHERE id = $1",
        [id],
      );

      if (jobCheck.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Discovery job not found" },
        };
      }

      const conditions: string[] = ["job_id = $3"];
      const params: unknown[] = [query.limit, offset, id];
      let paramIndex = 4;

      if (query.reachable !== undefined) {
        conditions.push(
          `(icmp_reachable = $${paramIndex} OR snmp_reachable = $${paramIndex})`,
        );
        params.push(query.reachable);
        paramIndex++;
      }

      if (query.added !== undefined) {
        conditions.push(`is_added_to_monitoring = $${paramIndex}`);
        params.push(query.added);
        paramIndex++;
      }

      if (query.site !== undefined) {
        if (query.site === "") {
          conditions.push(`site IS NULL`);
        } else {
          conditions.push(`site = $${paramIndex}`);
          params.push(query.site);
          paramIndex++;
        }
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const [countResult, dataResult] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) FROM npm.discovered_hosts ${whereClause}`,
          params.slice(2),
        ),
        pool.query(
          `SELECT id, job_id, ip_address, hostname, mac_address, vendor, model,
                  device_type, sys_name, sys_description, sys_contact, sys_location,
                  site, icmp_reachable, icmp_latency_ms, icmp_ttl, snmp_reachable, snmp_engine_id,
                  interfaces_count, uptime_seconds, os_family, open_ports, fingerprint_confidence,
                  is_added_to_monitoring, device_id, discovered_at
           FROM npm.discovered_hosts
           ${whereClause}
           ORDER BY ip_address
           LIMIT $1 OFFSET $2`,
          params,
        ),
      ]);

      return {
        success: true,
        data: dataResult.rows.map((row) => ({
          id: row.id,
          jobId: row.job_id,
          ipAddress: row.ip_address,
          hostname: row.hostname,
          macAddress: row.mac_address,
          vendor: row.vendor,
          model: row.model,
          deviceType: row.device_type,
          sysName: row.sys_name,
          sysDescription: row.sys_description,
          sysContact: row.sys_contact,
          sysLocation: row.sys_location,
          site: row.site,
          icmpReachable: row.icmp_reachable,
          icmpLatencyMs: row.icmp_latency_ms
            ? parseFloat(row.icmp_latency_ms)
            : null,
          icmpTtl: row.icmp_ttl,
          snmpReachable: row.snmp_reachable,
          snmpEngineId: row.snmp_engine_id,
          interfacesCount: row.interfaces_count,
          uptimeSeconds: row.uptime_seconds
            ? parseInt(row.uptime_seconds, 10)
            : null,
          osFamily: row.os_family,
          openPorts: row.open_ports,
          fingerprintConfidence: row.fingerprint_confidence,
          isAddedToMonitoring: row.is_added_to_monitoring,
          deviceId: row.device_id,
          discoveredAt: row.discovered_at,
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

  // Add discovered hosts to monitoring
  fastify.post(
    "/jobs/:id/hosts/add",
    {
      schema: {
        tags: ["NPM - Discovery"],
        summary: "Add discovered hosts to device monitoring",
        description:
          "Add one or more discovered hosts to the devices table for monitoring.",
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
          required: ["hostIds"],
          properties: {
            hostIds: {
              type: "array",
              items: { type: "string", format: "uuid" },
              minItems: 1,
            },
            pollIcmp: { type: "boolean", default: true },
            pollSnmp: { type: "boolean", default: false },
            snmpv3CredentialId: { type: "string", format: "uuid" },
            pollInterval: { type: "number", default: 60 },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = addHostsSchema.parse(request.body);

      // Verify job exists
      const jobCheck = await pool.query(
        "SELECT id, snmpv3_credential_id FROM npm.discovery_jobs WHERE id = $1",
        [id],
      );

      if (jobCheck.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Discovery job not found" },
        };
      }

      // Use job's credential if not specified
      const credentialId =
        body.snmpv3CredentialId || jobCheck.rows[0].snmpv3_credential_id;

      // Validate polling config
      if (!body.pollIcmp && !body.pollSnmp) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: "At least one polling method must be enabled",
          },
        };
      }

      if (body.pollSnmp && !credentialId) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message:
              "SNMPv3 credential is required when SNMP polling is enabled",
          },
        };
      }

      // Get hosts to add
      const hostsResult = await pool.query(
        `SELECT id, ip_address, hostname, vendor, model, device_type, sys_name
         FROM npm.discovered_hosts
         WHERE job_id = $1 AND id = ANY($2) AND is_added_to_monitoring = false`,
        [id, body.hostIds],
      );

      if (hostsResult.rows.length === 0) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message:
              "No valid hosts found to add. They may already be added or don't exist.",
          },
        };
      }

      const addedDevices: Array<{
        id: string;
        name: string;
        ipAddress: string;
      }> = [];

      // Add each host as a device
      for (const host of hostsResult.rows) {
        const deviceName = host.sys_name || host.hostname || host.ip_address;

        // Check if device with this IP already exists
        const existingDevice = await pool.query(
          "SELECT id FROM npm.devices WHERE ip_address = $1",
          [host.ip_address],
        );

        let deviceId: string;

        if (existingDevice.rows.length > 0) {
          // Update existing device
          deviceId = existingDevice.rows[0].id;
          await pool.query(
            `UPDATE npm.devices
             SET poll_icmp = $1, poll_snmp = $2, snmpv3_credential_id = $3,
                 poll_interval = $4, is_active = true
             WHERE id = $5`,
            [
              body.pollIcmp,
              body.pollSnmp,
              credentialId,
              body.pollInterval,
              deviceId,
            ],
          );
        } else {
          // Create new device
          const deviceResult = await pool.query(
            `INSERT INTO npm.devices (name, ip_address, device_type, vendor, model,
                                     poll_icmp, poll_snmp, snmpv3_credential_id, poll_interval, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
             RETURNING id`,
            [
              deviceName,
              host.ip_address,
              host.device_type,
              host.vendor,
              host.model,
              body.pollIcmp,
              body.pollSnmp,
              credentialId,
              body.pollInterval,
            ],
          );
          deviceId = deviceResult.rows[0].id;
        }

        // Mark host as added
        await pool.query(
          `UPDATE npm.discovered_hosts
           SET is_added_to_monitoring = true, device_id = $1
           WHERE id = $2`,
          [deviceId, host.id],
        );

        addedDevices.push({
          id: deviceId,
          name: deviceName,
          ipAddress: host.ip_address,
        });
      }

      logger.info("hosts_added_to_monitoring", {
        jobId: id,
        count: addedDevices.length,
      });

      return {
        success: true,
        data: {
          addedCount: addedDevices.length,
          devices: addedDevices,
        },
      };
    },
  );

  // Update site for discovered hosts
  fastify.patch(
    "/jobs/:id/hosts/site",
    {
      schema: {
        tags: ["NPM - Discovery"],
        summary: "Update site assignment for discovered hosts",
        description:
          "Assign or remove a site from one or more discovered hosts.",
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
          required: ["hostIds"],
          properties: {
            hostIds: {
              type: "array",
              items: { type: "string", format: "uuid" },
              minItems: 1,
            },
            site: {
              type: "string",
              nullable: true,
              description: "Site name or null to remove site assignment",
            },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateHostsSiteSchema.parse(request.body);

      // Verify job exists
      const jobCheck = await pool.query(
        "SELECT id FROM npm.discovery_jobs WHERE id = $1",
        [id],
      );

      if (jobCheck.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Discovery job not found" },
        };
      }

      // Update hosts with new site
      const result = await pool.query(
        `UPDATE npm.discovered_hosts
         SET site = $1
         WHERE job_id = $2 AND id = ANY($3)
         RETURNING id`,
        [body.site, id, body.hostIds],
      );

      logger.info("hosts_site_updated", {
        jobId: id,
        count: result.rowCount,
        site: body.site,
      });

      return {
        success: true,
        data: {
          updatedCount: result.rowCount,
          site: body.site,
        },
      };
    },
  );

  // Get distinct sites for a job
  fastify.get(
    "/jobs/:id/sites",
    {
      schema: {
        tags: ["NPM - Discovery"],
        summary: "Get distinct sites for discovered hosts in a job",
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

      // Verify job exists
      const jobCheck = await pool.query(
        "SELECT id FROM npm.discovery_jobs WHERE id = $1",
        [id],
      );

      if (jobCheck.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Discovery job not found" },
        };
      }

      // Get distinct sites and their counts
      const result = await pool.query(
        `SELECT site, COUNT(*) as count
         FROM npm.discovered_hosts
         WHERE job_id = $1
         GROUP BY site
         ORDER BY site NULLS FIRST`,
        [id],
      );

      return {
        success: true,
        data: result.rows.map((row) => ({
          site: row.site,
          count: parseInt(row.count, 10),
        })),
      };
    },
  );
};

export default discoveryRoutes;
