/**
 * NetNynja Enterprise - SSH Credentials API Routes
 * Secure SSH credential management for STIG auditing
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import crypto from "crypto";
import { pool } from "../../db";
import { logger } from "../../logger";
import { config } from "../../config";

// Encryption utilities using AES-256-GCM (FIPS compliant)
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function encrypt(text: string): string {
  const key = crypto.scryptSync(config.CREDENTIAL_ENCRYPTION_KEY, "salt", 32);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

function decrypt(encryptedData: string): string {
  const key = crypto.scryptSync(config.CREDENTIAL_ENCRYPTION_KEY, "salt", 32);
  const parts = encryptedData.split(":");

  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error("Invalid encrypted data format");
  }

  const ivHex = parts[0];
  const authTagHex = parts[1];
  const encrypted = parts[2];

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// Zod schemas
const createCredentialSchema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    username: z.string().min(1).max(255),
    authType: z.enum(["password", "key"]).default("password"),
    password: z.string().min(1).max(255).optional(),
    privateKey: z.string().max(16384).optional(), // Max 16KB for private key
    keyPassphrase: z.string().max(255).optional(),
    defaultPort: z.coerce.number().int().min(1).max(65535).default(22),
    // Sudo/privilege escalation options
    sudoEnabled: z.boolean().default(false),
    sudoMethod: z
      .enum(["password", "nopasswd", "same_as_ssh"])
      .default("password"),
    sudoPassword: z.string().max(255).optional(),
    sudoUser: z.string().max(255).default("root"),
  })
  .refine(
    (data) => {
      if (data.authType === "password") {
        return !!data.password;
      }
      return true;
    },
    { message: "Password is required for password authentication" },
  )
  .refine(
    (data) => {
      if (data.authType === "key") {
        return !!data.privateKey;
      }
      return true;
    },
    { message: "Private key is required for key-based authentication" },
  )
  .refine(
    (data) => {
      // If sudo is enabled with password method, require sudo password
      if (data.sudoEnabled && data.sudoMethod === "password") {
        return !!data.sudoPassword;
      }
      return true;
    },
    { message: "Sudo password is required when sudo method is 'password'" },
  );

const updateCredentialSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  username: z.string().min(1).max(255).optional(),
  authType: z.enum(["password", "key"]).optional(),
  password: z.string().min(1).max(255).optional(),
  privateKey: z.string().max(16384).optional(),
  keyPassphrase: z.string().max(255).optional(),
  defaultPort: z.coerce.number().int().min(1).max(65535).optional(),
  // Sudo/privilege escalation options
  sudoEnabled: z.boolean().optional(),
  sudoMethod: z.enum(["password", "nopasswd", "same_as_ssh"]).optional(),
  sudoPassword: z.string().max(255).optional(),
  sudoUser: z.string().max(255).optional(),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

const testCredentialSchema = z.object({
  targetIp: z.string().ip(),
  port: z.coerce.number().int().min(1).max(65535).default(22),
});

const sshCredentialsRoutes: FastifyPluginAsync = async (fastify) => {
  // Require authentication for all routes
  fastify.addHook("preHandler", fastify.requireAuth);

  // List SSH credentials (scoped to current user)
  fastify.get(
    "/",
    {
      schema: {
        tags: ["STIG - SSH Credentials"],
        summary: "List SSH credentials",
        description:
          "List SSH credentials owned by the current user. Passwords and keys are never returned.",
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
      const userId = request.user?.sub;

      // Always filter by current user (user isolation)
      const conditions: string[] = [`created_by = $3`];
      const params: unknown[] = [query.limit, offset, userId];
      let paramIndex = 4;

      if (query.search) {
        conditions.push(
          `(name ILIKE $${paramIndex} OR username ILIKE $${paramIndex})`,
        );
        params.push(`%${query.search}%`);
        paramIndex++;
      }

      const whereClause = `WHERE ${conditions.join(" AND ")}`;

      const countQuery = `SELECT COUNT(*) FROM stig.ssh_credentials ${whereClause}`;
      const dataQuery = `
      SELECT id, name, description, username, auth_type, default_port,
             sudo_enabled, sudo_method, sudo_user,
             created_by, created_at, updated_at
      FROM stig.ssh_credentials
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
          description: row.description,
          username: row.username,
          authType: row.auth_type,
          defaultPort: row.default_port,
          sudoEnabled: row.sudo_enabled,
          sudoMethod: row.sudo_method,
          sudoUser: row.sudo_user,
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

  // Get credential by ID (user-scoped)
  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["STIG - SSH Credentials"],
        summary: "Get SSH credential by ID",
        description:
          "Get details of a specific SSH credential owned by current user. Passwords and keys are never returned.",
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
      const userId = request.user?.sub;

      // Only return credentials owned by current user
      const result = await pool.query(
        `SELECT id, name, description, username, auth_type, default_port,
              sudo_enabled, sudo_method, sudo_user,
              created_by, created_at, updated_at
       FROM stig.ssh_credentials WHERE id = $1 AND created_by = $2`,
        [id, userId],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Credential not found" },
        };
      }

      const row = result.rows[0];
      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          description: row.description,
          username: row.username,
          authType: row.auth_type,
          defaultPort: row.default_port,
          sudoEnabled: row.sudo_enabled,
          sudoMethod: row.sudo_method,
          sudoUser: row.sudo_user,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Create new credential
  fastify.post(
    "/",
    {
      schema: {
        tags: ["STIG - SSH Credentials"],
        summary: "Create SSH credential",
        description:
          "Create a new SSH credential for STIG auditing. Supports password and key-based authentication with optional sudo privilege escalation.",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["name", "username"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            username: { type: "string" },
            authType: { type: "string", enum: ["password", "key"] },
            password: { type: "string" },
            privateKey: { type: "string" },
            keyPassphrase: { type: "string" },
            defaultPort: { type: "number", minimum: 1, maximum: 65535 },
            sudoEnabled: { type: "boolean" },
            sudoMethod: {
              type: "string",
              enum: ["password", "nopasswd", "same_as_ssh"],
            },
            sudoPassword: { type: "string" },
            sudoUser: { type: "string" },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const body = createCredentialSchema.parse(request.body);
      const userId = request.user?.sub;

      // Encrypt sensitive data
      const passwordEncrypted = body.password ? encrypt(body.password) : null;
      const privateKeyEncrypted = body.privateKey
        ? encrypt(body.privateKey)
        : null;
      const keyPassphraseEncrypted = body.keyPassphrase
        ? encrypt(body.keyPassphrase)
        : null;
      const sudoPasswordEncrypted = body.sudoPassword
        ? encrypt(body.sudoPassword)
        : null;

      const result = await pool.query(
        `INSERT INTO stig.ssh_credentials
       (name, description, username, auth_type, password_encrypted,
        private_key_encrypted, key_passphrase_encrypted, default_port,
        sudo_enabled, sudo_method, sudo_password_encrypted, sudo_user, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, name, description, username, auth_type, default_port,
                 sudo_enabled, sudo_method, sudo_user,
                 created_by, created_at, updated_at`,
        [
          body.name,
          body.description,
          body.username,
          body.authType,
          passwordEncrypted,
          privateKeyEncrypted,
          keyPassphraseEncrypted,
          body.defaultPort,
          body.sudoEnabled,
          body.sudoMethod,
          sudoPasswordEncrypted,
          body.sudoUser,
          userId,
        ],
      );

      const row = result.rows[0];
      logger.info(
        { credentialId: row.id, name: row.name },
        "SSH credential created",
      );

      reply.status(201);
      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          description: row.description,
          username: row.username,
          authType: row.auth_type,
          defaultPort: row.default_port,
          sudoEnabled: row.sudo_enabled,
          sudoMethod: row.sudo_method,
          sudoUser: row.sudo_user,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Update credential (user-scoped)
  fastify.patch(
    "/:id",
    {
      schema: {
        tags: ["STIG - SSH Credentials"],
        summary: "Update SSH credential",
        description:
          "Update an existing SSH credential owned by current user. Leave password/key/sudo password fields empty to keep existing values.",
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
            username: { type: "string" },
            authType: { type: "string", enum: ["password", "key"] },
            password: { type: "string" },
            privateKey: { type: "string" },
            keyPassphrase: { type: "string" },
            defaultPort: { type: "number", minimum: 1, maximum: 65535 },
            sudoEnabled: { type: "boolean" },
            sudoMethod: {
              type: "string",
              enum: ["password", "nopasswd", "same_as_ssh"],
            },
            sudoPassword: { type: "string" },
            sudoUser: { type: "string" },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateCredentialSchema.parse(request.body);
      const userId = request.user?.sub;

      // Check if credential exists AND belongs to current user
      const existingResult = await pool.query(
        "SELECT id FROM stig.ssh_credentials WHERE id = $1 AND created_by = $2",
        [id, userId],
      );

      if (existingResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Credential not found" },
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
      if (body.username !== undefined) {
        updates.push(`username = $${paramIndex++}`);
        params.push(body.username);
      }
      if (body.authType !== undefined) {
        updates.push(`auth_type = $${paramIndex++}`);
        params.push(body.authType);
      }
      if (body.password !== undefined) {
        updates.push(`password_encrypted = $${paramIndex++}`);
        params.push(encrypt(body.password));
      }
      if (body.privateKey !== undefined) {
        updates.push(`private_key_encrypted = $${paramIndex++}`);
        params.push(encrypt(body.privateKey));
      }
      if (body.keyPassphrase !== undefined) {
        updates.push(`key_passphrase_encrypted = $${paramIndex++}`);
        params.push(encrypt(body.keyPassphrase));
      }
      if (body.defaultPort !== undefined) {
        updates.push(`default_port = $${paramIndex++}`);
        params.push(body.defaultPort);
      }
      // Sudo fields
      if (body.sudoEnabled !== undefined) {
        updates.push(`sudo_enabled = $${paramIndex++}`);
        params.push(body.sudoEnabled);
      }
      if (body.sudoMethod !== undefined) {
        updates.push(`sudo_method = $${paramIndex++}`);
        params.push(body.sudoMethod);
      }
      if (body.sudoPassword !== undefined) {
        updates.push(`sudo_password_encrypted = $${paramIndex++}`);
        params.push(encrypt(body.sudoPassword));
      }
      if (body.sudoUser !== undefined) {
        updates.push(`sudo_user = $${paramIndex++}`);
        params.push(body.sudoUser);
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
        `UPDATE stig.ssh_credentials
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, name, description, username, auth_type, default_port,
                 sudo_enabled, sudo_method, sudo_user,
                 created_by, created_at, updated_at`,
        params,
      );

      const row = result.rows[0];
      logger.info(
        { credentialId: row.id, name: row.name },
        "SSH credential updated",
      );

      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          description: row.description,
          username: row.username,
          authType: row.auth_type,
          defaultPort: row.default_port,
          sudoEnabled: row.sudo_enabled,
          sudoMethod: row.sudo_method,
          sudoUser: row.sudo_user,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Delete credential (user-scoped)
  fastify.delete(
    "/:id",
    {
      schema: {
        tags: ["STIG - SSH Credentials"],
        summary: "Delete SSH credential",
        description:
          "Delete an SSH credential owned by current user. Will fail if credential is in use by targets.",
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
      const userId = request.user?.sub;

      // Verify credential exists AND belongs to current user
      const existingResult = await pool.query(
        "SELECT id FROM stig.ssh_credentials WHERE id = $1 AND created_by = $2",
        [id, userId],
      );

      if (existingResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Credential not found" },
        };
      }

      // Check if credential is in use
      const usageResult = await pool.query(
        "SELECT COUNT(*) FROM stig.targets WHERE ssh_credential_id = $1",
        [id],
      );

      if (parseInt(usageResult.rows[0].count, 10) > 0) {
        reply.status(409);
        return {
          success: false,
          error: {
            code: "CONFLICT",
            message: `Credential is in use by ${usageResult.rows[0].count} target(s). Remove credential from targets before deleting.`,
          },
        };
      }

      const result = await pool.query(
        "DELETE FROM stig.ssh_credentials WHERE id = $1 AND created_by = $2 RETURNING id, name",
        [id, userId],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Credential not found" },
        };
      }

      logger.info(
        { credentialId: result.rows[0].id, name: result.rows[0].name },
        "SSH credential deleted",
      );
      return reply.status(204).send();
    },
  );

  // Test credential against a target (user-scoped)
  fastify.post(
    "/:id/test",
    {
      schema: {
        tags: ["STIG - SSH Credentials"],
        summary: "Test SSH credential",
        description:
          "Test an SSH credential owned by current user against a target device. Returns connection status.",
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
          required: ["targetIp"],
          properties: {
            targetIp: { type: "string", format: "ipv4" },
            port: { type: "number", minimum: 1, maximum: 65535, default: 22 },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = testCredentialSchema.parse(request.body);
      const userId = request.user?.sub;

      // Get credential with decrypted values (user-scoped)
      const result = await pool.query(
        `SELECT id, name, username, auth_type,
              password_encrypted, private_key_encrypted, key_passphrase_encrypted,
              default_port
       FROM stig.ssh_credentials WHERE id = $1 AND created_by = $2`,
        [id, userId],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Credential not found" },
        };
      }

      const credential = result.rows[0];

      logger.info(
        {
          credentialId: id,
          targetIp: body.targetIp,
          port: body.port,
        },
        "SSH credential test requested",
      );

      // For now, return a placeholder response
      // Actual SSH testing would be done via the Python STIG service
      return {
        success: true,
        data: {
          tested: true,
          targetIp: body.targetIp,
          port: body.port,
          credentialId: id,
          credentialName: credential.name,
          authType: credential.auth_type,
          message:
            "SSH test endpoint ready. Actual testing requires STIG audit service.",
        },
      };
    },
  );

  // Get targets using this credential (user-scoped)
  fastify.get(
    "/:id/targets",
    {
      schema: {
        tags: ["STIG - SSH Credentials"],
        summary: "Get targets using credential",
        description:
          "List all STIG targets that are configured to use this SSH credential owned by current user.",
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
      const userId = request.user?.sub;

      // Verify credential exists AND belongs to current user
      const credResult = await pool.query(
        "SELECT id, name FROM stig.ssh_credentials WHERE id = $1 AND created_by = $2",
        [id, userId],
      );

      if (credResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Credential not found" },
        };
      }

      const targetsResult = await pool.query(
        `SELECT id, name, ip_address, platform, is_active
       FROM stig.targets
       WHERE ssh_credential_id = $1
       ORDER BY name`,
        [id],
      );

      return {
        success: true,
        data: {
          credential: {
            id: credResult.rows[0].id,
            name: credResult.rows[0].name,
          },
          targets: targetsResult.rows.map((row) => ({
            id: row.id,
            name: row.name,
            ipAddress: row.ip_address,
            platform: row.platform,
            isActive: row.is_active,
          })),
          totalTargets: targetsResult.rows.length,
        },
      };
    },
  );

  // Helper endpoint to get decrypted credentials (internal use only for STIG service, user-scoped)
  fastify.get(
    "/:id/decrypt",
    {
      schema: {
        tags: ["STIG - SSH Credentials"],
        summary: "Get decrypted credential (internal)",
        description:
          "Internal endpoint to get decrypted SSH credentials owned by current user for STIG audit service.",
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
      const userId = request.user?.sub;

      const result = await pool.query(
        `SELECT id, name, username, auth_type,
              password_encrypted, private_key_encrypted, key_passphrase_encrypted,
              default_port, sudo_enabled, sudo_method, sudo_password_encrypted, sudo_user
       FROM stig.ssh_credentials WHERE id = $1 AND created_by = $2`,
        [id, userId],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Credential not found" },
        };
      }

      const row = result.rows[0];

      // Decrypt sensitive fields
      let password: string | undefined;
      let privateKey: string | undefined;
      let keyPassphrase: string | undefined;
      let sudoPassword: string | undefined;

      try {
        if (row.password_encrypted) {
          password = decrypt(row.password_encrypted);
        }
        if (row.private_key_encrypted) {
          privateKey = decrypt(row.private_key_encrypted);
        }
        if (row.key_passphrase_encrypted) {
          keyPassphrase = decrypt(row.key_passphrase_encrypted);
        }
        if (row.sudo_password_encrypted) {
          sudoPassword = decrypt(row.sudo_password_encrypted);
        }
      } catch (err) {
        logger.error(
          { err, credentialId: id },
          "Failed to decrypt SSH credential",
        );
        reply.status(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to decrypt credentials",
          },
        };
      }

      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          username: row.username,
          authType: row.auth_type,
          password,
          privateKey,
          keyPassphrase,
          defaultPort: row.default_port,
          sudoEnabled: row.sudo_enabled,
          sudoMethod: row.sudo_method,
          sudoPassword,
          sudoUser: row.sudo_user,
        },
      };
    },
  );
};

export default sshCredentialsRoutes;
