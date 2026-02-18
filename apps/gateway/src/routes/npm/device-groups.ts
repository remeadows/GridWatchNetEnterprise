/**
 * GridWatch NetEnterprise - NPM Device Groups API Routes
 * Manage device groups for organizing monitored devices
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { pool } from "../../db";
import { logger } from "../../logger";

// Zod schemas
const deviceGroupSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex color")
    .default("#6366f1"),
  parentId: z.string().uuid().optional(),
});

const updateDeviceGroupSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex color")
    .optional(),
  parentId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

const assignDevicesSchema = z.object({
  deviceIds: z.array(z.string().uuid()).min(1).max(500),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  includeInactive: z.coerce.boolean().optional().default(false),
});

export interface DeviceGroup {
  id: string;
  name: string;
  description: string | null;
  color: string;
  parentId: string | null;
  parentName: string | null;
  deviceCount: number;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const deviceGroupsRoutes: FastifyPluginAsync = async (fastify) => {
  // Require authentication for all device group routes
  fastify.addHook("preHandler", fastify.requireAuth);

  // List device groups
  fastify.get(
    "/",
    {
      schema: {
        tags: ["NPM - Device Groups"],
        summary: "List device groups",
        description: "Returns all device groups with device counts",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            page: { type: "number", minimum: 1, default: 1 },
            limit: { type: "number", minimum: 1, maximum: 100, default: 50 },
            search: { type: "string" },
            includeInactive: { type: "boolean", default: false },
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

      if (!query.includeInactive) {
        conditions.push("g.is_active = true");
      }

      if (query.search) {
        conditions.push(
          `(g.name ILIKE $${paramIndex} OR g.description ILIKE $${paramIndex})`,
        );
        params.push(`%${query.search}%`);
        paramIndex++;
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const countQuery = `SELECT COUNT(*) FROM npm.device_groups g ${whereClause}`;
      const dataQuery = `
        SELECT g.id, g.name, g.description, g.color, g.parent_id,
               p.name as parent_name, g.device_count, g.is_active,
               g.created_by, g.created_at, g.updated_at
        FROM npm.device_groups g
        LEFT JOIN npm.device_groups p ON g.parent_id = p.id
        ${whereClause}
        ORDER BY g.name
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
          description: row.description,
          color: row.color,
          parentId: row.parent_id,
          parentName: row.parent_name,
          deviceCount: row.device_count,
          isActive: row.is_active,
          createdBy: row.created_by,
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

  // Get device group by ID
  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["NPM - Device Groups"],
        summary: "Get device group by ID",
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
        `SELECT g.id, g.name, g.description, g.color, g.parent_id,
                p.name as parent_name, g.device_count, g.is_active,
                g.created_by, g.created_at, g.updated_at
         FROM npm.device_groups g
         LEFT JOIN npm.device_groups p ON g.parent_id = p.id
         WHERE g.id = $1`,
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Device group not found" },
        };
      }

      const row = result.rows[0];
      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          description: row.description,
          color: row.color,
          parentId: row.parent_id,
          parentName: row.parent_name,
          deviceCount: row.device_count,
          isActive: row.is_active,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Create device group
  fastify.post(
    "/",
    {
      schema: {
        tags: ["NPM - Device Groups"],
        summary: "Create a new device group",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            color: { type: "string" },
            parentId: { type: "string", format: "uuid" },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const body = deviceGroupSchema.parse(request.body);
      const user = request.user as { sub: string };

      // Check for duplicate name
      const existingResult = await pool.query(
        "SELECT id FROM npm.device_groups WHERE name = $1",
        [body.name],
      );

      if (existingResult.rows.length > 0) {
        reply.status(409);
        return {
          success: false,
          error: {
            code: "CONFLICT",
            message: "A device group with this name already exists",
          },
        };
      }

      // If parent is specified, verify it exists
      if (body.parentId) {
        const parentResult = await pool.query(
          "SELECT id FROM npm.device_groups WHERE id = $1",
          [body.parentId],
        );
        if (parentResult.rows.length === 0) {
          reply.status(400);
          return {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "Parent device group not found",
            },
          };
        }
      }

      const result = await pool.query(
        `INSERT INTO npm.device_groups (name, description, color, parent_id, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, description, color, parent_id, device_count, is_active,
                   created_by, created_at, updated_at`,
        [body.name, body.description, body.color, body.parentId, user.sub],
      );

      const row = result.rows[0];
      logger.info({ groupId: row.id, name: body.name }, "Device group created");

      reply.status(201);
      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          description: row.description,
          color: row.color,
          parentId: row.parent_id,
          parentName: null,
          deviceCount: row.device_count,
          isActive: row.is_active,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Update device group
  fastify.patch(
    "/:id",
    {
      schema: {
        tags: ["NPM - Device Groups"],
        summary: "Update a device group",
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
            description: { type: "string" },
            color: { type: "string" },
            parentId: { type: "string", format: "uuid", nullable: true },
            isActive: { type: "boolean" },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateDeviceGroupSchema.parse(request.body);

      // Check if group exists
      const existingResult = await pool.query(
        "SELECT id FROM npm.device_groups WHERE id = $1",
        [id],
      );

      if (existingResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Device group not found" },
        };
      }

      // Check for duplicate name if name is being changed
      if (body.name) {
        const duplicateResult = await pool.query(
          "SELECT id FROM npm.device_groups WHERE name = $1 AND id != $2",
          [body.name, id],
        );
        if (duplicateResult.rows.length > 0) {
          reply.status(409);
          return {
            success: false,
            error: {
              code: "CONFLICT",
              message: "A device group with this name already exists",
            },
          };
        }
      }

      // Prevent circular parent reference
      if (body.parentId === id) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: "A group cannot be its own parent",
          },
        };
      }

      // Build update query dynamically
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
      if (body.color !== undefined) {
        updates.push(`color = $${paramIndex++}`);
        params.push(body.color);
      }
      if (body.parentId !== undefined) {
        updates.push(`parent_id = $${paramIndex++}`);
        params.push(body.parentId);
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
        `UPDATE npm.device_groups
         SET ${updates.join(", ")}
         WHERE id = $${paramIndex}
         RETURNING id, name, description, color, parent_id, device_count, is_active,
                   created_by, created_at, updated_at`,
        params,
      );

      const row = result.rows[0];
      logger.info({ groupId: id }, "Device group updated");

      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          description: row.description,
          color: row.color,
          parentId: row.parent_id,
          parentName: null,
          deviceCount: row.device_count,
          isActive: row.is_active,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Delete device group
  fastify.delete(
    "/:id",
    {
      schema: {
        tags: ["NPM - Device Groups"],
        summary: "Delete a device group",
        description:
          "Deletes a device group. Devices in the group will have their group_id set to null.",
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

      // First, unassign all devices from this group
      await pool.query(
        "UPDATE npm.devices SET group_id = NULL WHERE group_id = $1",
        [id],
      );

      // Also update any child groups to remove parent reference
      await pool.query(
        "UPDATE npm.device_groups SET parent_id = NULL WHERE parent_id = $1",
        [id],
      );

      const result = await pool.query(
        "DELETE FROM npm.device_groups WHERE id = $1 RETURNING id",
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Device group not found" },
        };
      }

      logger.info({ groupId: id }, "Device group deleted");
      return reply.status(204).send();
    },
  );

  // Get devices in a group
  fastify.get(
    "/:id/devices",
    {
      schema: {
        tags: ["NPM - Device Groups"],
        summary: "List devices in a group",
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
            limit: { type: "number", minimum: 1, maximum: 500, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = querySchema.parse(request.query);
      const offset = (query.page - 1) * query.limit;

      // Verify group exists
      const groupResult = await pool.query(
        "SELECT id, name FROM npm.device_groups WHERE id = $1",
        [id],
      );

      if (groupResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Device group not found" },
        };
      }

      const countQuery = `SELECT COUNT(*) FROM npm.devices WHERE group_id = $1`;
      const dataQuery = `
        SELECT d.id, d.name, d.ip_address, d.device_type, d.vendor, d.model,
               d.status, d.poll_icmp, d.poll_snmp, d.is_active, d.last_poll
        FROM npm.devices d
        WHERE d.group_id = $1
        ORDER BY d.name
        LIMIT $2 OFFSET $3
      `;

      const [countResult, dataResult] = await Promise.all([
        pool.query(countQuery, [id]),
        pool.query(dataQuery, [id, query.limit, offset]),
      ]);

      return {
        success: true,
        data: {
          groupId: id,
          groupName: groupResult.rows[0].name,
          devices: dataResult.rows.map((row) => ({
            id: row.id,
            name: row.name,
            ipAddress: row.ip_address,
            deviceType: row.device_type,
            vendor: row.vendor,
            model: row.model,
            status: row.status,
            pollIcmp: row.poll_icmp,
            pollSnmp: row.poll_snmp,
            isActive: row.is_active,
            lastPoll: row.last_poll,
          })),
        },
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

  // Assign devices to a group
  fastify.post(
    "/:id/devices",
    {
      schema: {
        tags: ["NPM - Device Groups"],
        summary: "Assign devices to a group",
        description: "Assigns one or more devices to this device group",
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
          required: ["deviceIds"],
          properties: {
            deviceIds: { type: "array", items: { type: "string" } },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = assignDevicesSchema.parse(request.body);

      // Verify group exists
      const groupResult = await pool.query(
        "SELECT id, name FROM npm.device_groups WHERE id = $1",
        [id],
      );

      if (groupResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Device group not found" },
        };
      }

      // Update all specified devices
      const result = await pool.query(
        `UPDATE npm.devices
         SET group_id = $1
         WHERE id = ANY($2::uuid[])
         RETURNING id`,
        [id, body.deviceIds],
      );

      logger.info(
        { groupId: id, assignedCount: result.rowCount },
        "Devices assigned to group",
      );

      return {
        success: true,
        data: {
          groupId: id,
          groupName: groupResult.rows[0].name,
          assignedCount: result.rowCount || 0,
        },
      };
    },
  );

  // Remove devices from a group (unassign)
  fastify.delete(
    "/:id/devices",
    {
      schema: {
        tags: ["NPM - Device Groups"],
        summary: "Remove devices from a group",
        description: "Removes (unassigns) devices from this device group",
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
          required: ["deviceIds"],
          properties: {
            deviceIds: { type: "array", items: { type: "string" } },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = assignDevicesSchema.parse(request.body);

      // Update devices to remove from group (only if they're in this group)
      const result = await pool.query(
        `UPDATE npm.devices
         SET group_id = NULL
         WHERE id = ANY($1::uuid[]) AND group_id = $2
         RETURNING id`,
        [body.deviceIds, id],
      );

      logger.info(
        { groupId: id, removedCount: result.rowCount },
        "Devices removed from group",
      );

      return {
        success: true,
        data: {
          groupId: id,
          removedCount: result.rowCount || 0,
        },
      };
    },
  );
};

export default deviceGroupsRoutes;
