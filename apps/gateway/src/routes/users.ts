/**
 * NetNynja Enterprise - User Management Routes
 * Admin-only user management endpoints
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { pool } from "../db";
import { logger } from "../logger";
import * as argon2 from "argon2";

// Zod schemas
const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "operator", "viewer"]).default("viewer"),
  isActive: z.boolean().default(true),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(["admin", "operator", "viewer"]).optional(),
  isActive: z.boolean().optional(),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  // Require authentication for all user management routes
  fastify.addHook("preHandler", fastify.requireAuth);
  // Require admin role for all routes
  fastify.addHook("preHandler", fastify.requireRole("admin"));

  // List users
  fastify.get(
    "/",
    {
      schema: {
        tags: ["User Management"],
        summary: "List all users",
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

      const searchCondition = query.search
        ? `WHERE username ILIKE $3 OR email ILIKE $3`
        : "";
      const searchParam = query.search ? `%${query.search}%` : null;

      const countQuery = `SELECT COUNT(*) FROM shared.users ${searchCondition}`;
      const dataQuery = `
      SELECT id, username, email, role, is_active, last_login, failed_login_attempts, created_at, updated_at
      FROM shared.users
      ${searchCondition}
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;

      const params = searchParam
        ? [query.limit, offset, searchParam]
        : [query.limit, offset];

      const [countResult, dataResult] = await Promise.all([
        pool.query(countQuery, searchParam ? [searchParam] : []),
        pool.query(dataQuery, params),
      ]);

      return {
        success: true,
        data: dataResult.rows.map((row) => ({
          id: row.id,
          username: row.username,
          email: row.email,
          role: row.role,
          isActive: row.is_active,
          lastLogin: row.last_login,
          failedLoginAttempts: row.failed_login_attempts,
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

  // Get user by ID
  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["User Management"],
        summary: "Get user by ID",
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
        `SELECT id, username, email, role, is_active, last_login, failed_login_attempts, created_at, updated_at
       FROM shared.users WHERE id = $1`,
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "User not found" },
        };
      }

      const row = result.rows[0];
      return {
        success: true,
        data: {
          id: row.id,
          username: row.username,
          email: row.email,
          role: row.role,
          isActive: row.is_active,
          lastLogin: row.last_login,
          failedLoginAttempts: row.failed_login_attempts,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Create user
  fastify.post(
    "/",
    {
      schema: {
        tags: ["User Management"],
        summary: "Create a new user",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["username", "email", "password"],
          properties: {
            username: { type: "string", minLength: 3, maxLength: 50 },
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
            role: { type: "string", enum: ["admin", "operator", "viewer"] },
            isActive: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      const body = createUserSchema.parse(request.body);

      // Check if username or email already exists
      const existingUser = await pool.query(
        "SELECT id FROM shared.users WHERE username = $1 OR email = $2",
        [body.username, body.email],
      );

      if (existingUser.rows.length > 0) {
        reply.status(409);
        return {
          success: false,
          error: {
            code: "CONFLICT",
            message: "Username or email already exists",
          },
        };
      }

      // Hash password
      const passwordHash = await argon2.hash(body.password);

      const result = await pool.query(
        `INSERT INTO shared.users (username, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, role, is_active, created_at, updated_at`,
        [body.username, body.email, passwordHash, body.role, body.isActive],
      );

      const row = result.rows[0];
      logger.info({ userId: row.id, username: row.username }, "User created");

      reply.status(201);
      return {
        success: true,
        data: {
          id: row.id,
          username: row.username,
          email: row.email,
          role: row.role,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Update user
  fastify.put(
    "/:id",
    {
      schema: {
        tags: ["User Management"],
        summary: "Update a user",
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
      const currentUserId = request.user?.sub;
      const body = updateUserSchema.parse(request.body);

      // #082: Prevent self-disable
      if (body.isActive === false && id === currentUserId) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Cannot disable your own account",
          },
        };
      }

      // Get target user to check if they're an admin
      const targetUser = await pool.query(
        "SELECT role, is_active FROM shared.users WHERE id = $1",
        [id],
      );

      if (targetUser.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "User not found" },
        };
      }

      const targetRole = targetUser.rows[0].role;

      // #082: Prevent disabling or demoting the last active admin
      if (
        targetRole === "admin" &&
        (body.isActive === false || (body.role && body.role !== "admin"))
      ) {
        const adminCount = await pool.query(
          "SELECT COUNT(*) FROM shared.users WHERE role = 'admin' AND is_active = true AND id != $1",
          [id],
        );

        if (parseInt(adminCount.rows[0].count, 10) === 0) {
          reply.status(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                "Cannot disable or demote the last active admin. Promote another user to admin first.",
            },
          };
        }
      }

      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (body.email) {
        updates.push(`email = $${paramIndex++}`);
        values.push(body.email);
      }
      if (body.password) {
        const passwordHash = await argon2.hash(body.password);
        updates.push(`password_hash = $${paramIndex++}`);
        values.push(passwordHash);
      }
      if (body.role !== undefined) {
        updates.push(`role = $${paramIndex++}`);
        values.push(body.role);
      }
      if (body.isActive !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        values.push(body.isActive);
      }

      if (updates.length === 0) {
        reply.status(400);
        return {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "No fields to update" },
        };
      }

      values.push(id);
      const result = await pool.query(
        `UPDATE shared.users SET ${updates.join(", ")}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING id, username, email, role, is_active, last_login, created_at, updated_at`,
        values,
      );

      const row = result.rows[0];
      logger.info({ userId: row.id, username: row.username }, "User updated");

      return {
        success: true,
        data: {
          id: row.id,
          username: row.username,
          email: row.email,
          role: row.role,
          isActive: row.is_active,
          lastLogin: row.last_login,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Delete user
  fastify.delete(
    "/:id",
    {
      schema: {
        tags: ["User Management"],
        summary: "Delete a user",
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
      const currentUserId = request.user?.sub;

      // Prevent self-deletion
      if (id === currentUserId) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Cannot delete your own account",
          },
        };
      }

      // Check if user exists first
      const userCheck = await pool.query(
        "SELECT id, username, role FROM shared.users WHERE id = $1",
        [id],
      );

      if (userCheck.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "User not found" },
        };
      }

      const targetUser = userCheck.rows[0];

      // Prevent deleting the last admin
      if (targetUser.role === "admin") {
        const adminCount = await pool.query(
          "SELECT COUNT(*) FROM shared.users WHERE role = 'admin' AND is_active = true AND id != $1",
          [id],
        );

        if (parseInt(adminCount.rows[0].count, 10) === 0) {
          reply.status(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                "Cannot delete the last active admin. Promote another user to admin first.",
            },
          };
        }
      }

      // Use a transaction to clean up related records and delete the user
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Set created_by/updated_by references to NULL for records that shouldn't be deleted
        // These are audit/tracking fields and setting to NULL preserves the records
        await client.query(
          "UPDATE shared.audit_log SET user_id = NULL WHERE user_id = $1",
          [id],
        );
        await client.query(
          "UPDATE shared.settings SET updated_by = NULL WHERE updated_by = $1",
          [id],
        );
        await client.query(
          "UPDATE ipam.networks SET created_by = NULL WHERE created_by = $1",
          [id],
        );
        await client.query(
          "UPDATE npm.alert_rules SET created_by = NULL WHERE created_by = $1",
          [id],
        );
        await client.query(
          "UPDATE npm.alerts SET acknowledged_by = NULL WHERE acknowledged_by = $1",
          [id],
        );
        await client.query(
          "UPDATE stig.audit_jobs SET created_by = NULL WHERE created_by = $1",
          [id],
        );
        await client.query(
          "UPDATE npm.snmpv3_credentials SET created_by = NULL WHERE created_by = $1",
          [id],
        );
        await client.query(
          "UPDATE npm.device_groups SET created_by = NULL WHERE created_by = $1",
          [id],
        );
        await client.query(
          "UPDATE npm.discovery_jobs SET created_by = NULL WHERE created_by = $1",
          [id],
        );

        // Delete refresh tokens (cascade should handle this, but explicit is safer)
        await client.query(
          "DELETE FROM shared.refresh_tokens WHERE user_id = $1",
          [id],
        );

        // Now delete the user
        const result = await client.query(
          "DELETE FROM shared.users WHERE id = $1 RETURNING id, username",
          [id],
        );

        await client.query("COMMIT");

        const row = result.rows[0];
        logger.info({ userId: row.id, username: row.username }, "User deleted");

        return { success: true, message: "User deleted" };
      } catch (error) {
        await client.query("ROLLBACK");
        logger.error({ error, userId: id }, "Failed to delete user");
        throw error;
      } finally {
        client.release();
      }
    },
  );

  // Reset user password (admin action)
  fastify.post(
    "/:id/reset-password",
    {
      schema: {
        tags: ["User Management"],
        summary: "Reset user password",
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
          required: ["newPassword"],
          properties: {
            newPassword: { type: "string", minLength: 8 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { newPassword } = request.body as { newPassword: string };

      if (!newPassword || newPassword.length < 8) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Password must be at least 8 characters",
          },
        };
      }

      const passwordHash = await argon2.hash(newPassword);

      const result = await pool.query(
        `UPDATE shared.users
       SET password_hash = $1, failed_login_attempts = 0, updated_at = NOW()
       WHERE id = $2
       RETURNING id, username`,
        [passwordHash, id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "User not found" },
        };
      }

      const row = result.rows[0];
      logger.info(
        { userId: row.id, username: row.username },
        "User password reset by admin",
      );

      return { success: true, message: "Password reset successfully" };
    },
  );

  // Unlock user account
  fastify.post(
    "/:id/unlock",
    {
      schema: {
        tags: ["User Management"],
        summary: "Unlock user account",
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
        `UPDATE shared.users
       SET failed_login_attempts = 0, updated_at = NOW()
       WHERE id = $1
       RETURNING id, username`,
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "User not found" },
        };
      }

      const row = result.rows[0];
      logger.info(
        { userId: row.id, username: row.username },
        "User account unlocked",
      );

      return { success: true, message: "Account unlocked" };
    },
  );
};

export default usersRoutes;
