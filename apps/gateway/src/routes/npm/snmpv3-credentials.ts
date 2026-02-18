/**
 * GridWatch NetEnterprise - SNMPv3 Credentials API Routes
 * FIPS-compliant SNMPv3 credential management
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import crypto from "crypto";
import { pool } from "../../db";
import { logger } from "../../logger";
import { config } from "../../config";
import { testSNMPv3Credential } from "../../snmp";

// Encryption utilities using AES-256-GCM (FIPS compliant)
// SEC-018: Per-record random salt for scrypt key derivation.
// Each encrypted value gets its own unique derived key, limiting blast
// radius if the master encryption key is compromised.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

function encrypt(text: string): string {
  // SEC-018: Generate unique random salt per record
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = crypto.scryptSync(config.CREDENTIAL_ENCRYPTION_KEY, salt, 32);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  // New format (4 parts): salt:iv:authTag:encrypted
  return `${salt.toString("hex")}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

function decrypt(encryptedData: string): string {
  const parts = encryptedData.split(":");

  let salt: Buffer;
  let ivHex: string;
  let authTagHex: string;
  let encrypted: string;

  if (parts.length === 4 && parts[0] && parts[1] && parts[2] && parts[3]) {
    // SEC-018: New format with per-record salt — salt:iv:authTag:encrypted
    salt = Buffer.from(parts[0], "hex");
    ivHex = parts[1];
    authTagHex = parts[2];
    encrypted = parts[3];
  } else if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    // Legacy format (pre-SEC-018): iv:authTag:encrypted with static "salt"
    // Backward compatible — will decrypt existing credentials without migration
    salt = Buffer.from("salt");
    ivHex = parts[0];
    authTagHex = parts[1];
    encrypted = parts[2];
  } else {
    throw new Error("Invalid encrypted data format");
  }

  const key = crypto.scryptSync(config.CREDENTIAL_ENCRYPTION_KEY, salt, 32);
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
    securityLevel: z
      .enum(["noAuthNoPriv", "authNoPriv", "authPriv"])
      .default("authPriv"),
    authProtocol: z
      .enum(["SHA", "SHA-224", "SHA-256", "SHA-384", "SHA-512"])
      .optional(),
    authPassword: z.string().min(8).max(255).optional(),
    privProtocol: z.enum(["AES", "AES-192", "AES-256"]).optional(),
    privPassword: z.string().min(8).max(255).optional(),
    contextName: z.string().max(255).optional(),
    contextEngineId: z.string().max(255).optional(),
  })
  .refine(
    (data) => {
      if (
        data.securityLevel === "authNoPriv" ||
        data.securityLevel === "authPriv"
      ) {
        return data.authProtocol && data.authPassword;
      }
      return true;
    },
    {
      message:
        "Authentication protocol and password required for authNoPriv/authPriv security levels",
    },
  )
  .refine(
    (data) => {
      if (data.securityLevel === "authPriv") {
        return data.privProtocol && data.privPassword;
      }
      return true;
    },
    {
      message:
        "Privacy protocol and password required for authPriv security level",
    },
  );

const updateCredentialSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  username: z.string().min(1).max(255).optional(),
  securityLevel: z.enum(["noAuthNoPriv", "authNoPriv", "authPriv"]).optional(),
  authProtocol: z
    .enum(["SHA", "SHA-224", "SHA-256", "SHA-384", "SHA-512"])
    .optional(),
  authPassword: z.string().min(8).max(255).optional(),
  privProtocol: z.enum(["AES", "AES-192", "AES-256"]).optional(),
  privPassword: z.string().min(8).max(255).optional(),
  contextName: z.string().max(255).optional(),
  contextEngineId: z.string().max(255).optional(),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

const testCredentialSchema = z.object({
  targetIp: z.string().ip(),
  port: z.coerce.number().int().min(1).max(65535).default(161),
});

const snmpv3CredentialsRoutes: FastifyPluginAsync = async (fastify) => {
  // Require authentication for all routes
  fastify.addHook("preHandler", fastify.requireAuth);

  // List all SNMPv3 credentials
  fastify.get(
    "/",
    {
      schema: {
        tags: ["NPM - SNMPv3 Credentials"],
        summary: "List SNMPv3 credentials",
        description:
          "List all SNMPv3 credentials. Passwords are never returned.",
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
          `(name ILIKE $${paramIndex} OR username ILIKE $${paramIndex})`,
        );
        params.push(`%${query.search}%`);
        paramIndex++;
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const countQuery = `SELECT COUNT(*) FROM npm.snmpv3_credentials ${whereClause}`;
      const dataQuery = `
      SELECT id, name, description, username, security_level,
             auth_protocol, priv_protocol, context_name, context_engine_id,
             created_by, created_at, updated_at
      FROM npm.snmpv3_credentials
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
          securityLevel: row.security_level,
          authProtocol: row.auth_protocol,
          privProtocol: row.priv_protocol,
          contextName: row.context_name,
          contextEngineId: row.context_engine_id,
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

  // Get credential by ID
  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["NPM - SNMPv3 Credentials"],
        summary: "Get SNMPv3 credential by ID",
        description:
          "Get details of a specific SNMPv3 credential. Passwords are never returned.",
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
        `SELECT id, name, description, username, security_level,
              auth_protocol, priv_protocol, context_name, context_engine_id,
              created_by, created_at, updated_at
       FROM npm.snmpv3_credentials WHERE id = $1`,
        [id],
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
          securityLevel: row.security_level,
          authProtocol: row.auth_protocol,
          privProtocol: row.priv_protocol,
          contextName: row.context_name,
          contextEngineId: row.context_engine_id,
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
        tags: ["NPM - SNMPv3 Credentials"],
        summary: "Create SNMPv3 credential",
        description:
          "Create a new SNMPv3 credential set. Only FIPS-compliant algorithms are supported.",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["name", "username"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            username: { type: "string" },
            securityLevel: {
              type: "string",
              enum: ["noAuthNoPriv", "authNoPriv", "authPriv"],
            },
            authProtocol: {
              type: "string",
              enum: ["SHA", "SHA-224", "SHA-256", "SHA-384", "SHA-512"],
            },
            authPassword: { type: "string" },
            privProtocol: {
              type: "string",
              enum: ["AES", "AES-192", "AES-256"],
            },
            privPassword: { type: "string" },
            contextName: { type: "string" },
            contextEngineId: { type: "string" },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const body = createCredentialSchema.parse(request.body);
      const userId = request.user?.sub;

      // Encrypt passwords if provided
      const authPasswordEncrypted = body.authPassword
        ? encrypt(body.authPassword)
        : null;
      const privPasswordEncrypted = body.privPassword
        ? encrypt(body.privPassword)
        : null;

      const result = await pool.query(
        `INSERT INTO npm.snmpv3_credentials
       (name, description, username, security_level, auth_protocol, auth_password_encrypted,
        priv_protocol, priv_password_encrypted, context_name, context_engine_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, name, description, username, security_level, auth_protocol,
                 priv_protocol, context_name, context_engine_id, created_by, created_at, updated_at`,
        [
          body.name,
          body.description,
          body.username,
          body.securityLevel,
          body.authProtocol,
          authPasswordEncrypted,
          body.privProtocol,
          privPasswordEncrypted,
          body.contextName,
          body.contextEngineId,
          userId,
        ],
      );

      const row = result.rows[0];
      logger.info(
        { credentialId: row.id, name: row.name },
        "SNMPv3 credential created",
      );

      reply.status(201);
      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          description: row.description,
          username: row.username,
          securityLevel: row.security_level,
          authProtocol: row.auth_protocol,
          privProtocol: row.priv_protocol,
          contextName: row.context_name,
          contextEngineId: row.context_engine_id,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Update credential
  fastify.patch(
    "/:id",
    {
      schema: {
        tags: ["NPM - SNMPv3 Credentials"],
        summary: "Update SNMPv3 credential",
        description:
          "Update an existing SNMPv3 credential. Leave password fields empty to keep existing passwords.",
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
            securityLevel: {
              type: "string",
              enum: ["noAuthNoPriv", "authNoPriv", "authPriv"],
            },
            authProtocol: {
              type: "string",
              enum: ["SHA", "SHA-224", "SHA-256", "SHA-384", "SHA-512"],
            },
            authPassword: { type: "string" },
            privProtocol: {
              type: "string",
              enum: ["AES", "AES-192", "AES-256"],
            },
            privPassword: { type: "string" },
            contextName: { type: "string" },
            contextEngineId: { type: "string" },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateCredentialSchema.parse(request.body);

      // Check if credential exists
      const existingResult = await pool.query(
        "SELECT id FROM npm.snmpv3_credentials WHERE id = $1",
        [id],
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
      if (body.securityLevel !== undefined) {
        updates.push(`security_level = $${paramIndex++}`);
        params.push(body.securityLevel);
      }
      if (body.authProtocol !== undefined) {
        updates.push(`auth_protocol = $${paramIndex++}`);
        params.push(body.authProtocol);
      }
      if (body.authPassword !== undefined) {
        updates.push(`auth_password_encrypted = $${paramIndex++}`);
        params.push(encrypt(body.authPassword));
      }
      if (body.privProtocol !== undefined) {
        updates.push(`priv_protocol = $${paramIndex++}`);
        params.push(body.privProtocol);
      }
      if (body.privPassword !== undefined) {
        updates.push(`priv_password_encrypted = $${paramIndex++}`);
        params.push(encrypt(body.privPassword));
      }
      if (body.contextName !== undefined) {
        updates.push(`context_name = $${paramIndex++}`);
        params.push(body.contextName);
      }
      if (body.contextEngineId !== undefined) {
        updates.push(`context_engine_id = $${paramIndex++}`);
        params.push(body.contextEngineId);
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
        `UPDATE npm.snmpv3_credentials
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, name, description, username, security_level, auth_protocol,
                 priv_protocol, context_name, context_engine_id, created_by, created_at, updated_at`,
        params,
      );

      const row = result.rows[0];
      logger.info(
        { credentialId: row.id, name: row.name },
        "SNMPv3 credential updated",
      );

      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          description: row.description,
          username: row.username,
          securityLevel: row.security_level,
          authProtocol: row.auth_protocol,
          privProtocol: row.priv_protocol,
          contextName: row.context_name,
          contextEngineId: row.context_engine_id,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Delete credential
  fastify.delete(
    "/:id",
    {
      schema: {
        tags: ["NPM - SNMPv3 Credentials"],
        summary: "Delete SNMPv3 credential",
        description:
          "Delete an SNMPv3 credential. Will fail if credential is in use by devices.",
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

      // Check if credential is in use
      const usageResult = await pool.query(
        "SELECT COUNT(*) FROM npm.devices WHERE snmpv3_credential_id = $1",
        [id],
      );

      if (parseInt(usageResult.rows[0].count, 10) > 0) {
        reply.status(409);
        return {
          success: false,
          error: {
            code: "CONFLICT",
            message: `Credential is in use by ${usageResult.rows[0].count} device(s). Remove credential from devices before deleting.`,
          },
        };
      }

      const result = await pool.query(
        "DELETE FROM npm.snmpv3_credentials WHERE id = $1 RETURNING id, name",
        [id],
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
        "SNMPv3 credential deleted",
      );
      return reply.status(204).send();
    },
  );

  // Test credential against a device
  fastify.post(
    "/:id/test",
    {
      schema: {
        tags: ["NPM - SNMPv3 Credentials"],
        summary: "Test SNMPv3 credential",
        description:
          "Test an SNMPv3 credential against a target device. Returns sysDescr if successful.",
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
            port: { type: "number", minimum: 1, maximum: 65535, default: 161 },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = testCredentialSchema.parse(request.body);

      // Get credential with decrypted passwords
      const result = await pool.query(
        `SELECT id, name, username, security_level, auth_protocol,
              auth_password_encrypted, priv_protocol, priv_password_encrypted,
              context_name, context_engine_id
       FROM npm.snmpv3_credentials WHERE id = $1`,
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Credential not found" },
        };
      }

      const credential = result.rows[0];

      // Decrypt passwords for testing
      let authPassword: string | undefined;
      let privPassword: string | undefined;

      try {
        if (credential.auth_password_encrypted) {
          authPassword = decrypt(credential.auth_password_encrypted);
        }
        if (credential.priv_password_encrypted) {
          privPassword = decrypt(credential.priv_password_encrypted);
        }
      } catch (err) {
        logger.error(
          { err, credentialId: id },
          "Failed to decrypt credential passwords",
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

      logger.info(
        {
          credentialId: id,
          targetIp: body.targetIp,
          port: body.port,
        },
        "SNMPv3 credential test requested",
      );

      // Perform actual SNMPv3 test
      const testResult = await testSNMPv3Credential(body.targetIp, body.port, {
        username: credential.username,
        securityLevel: credential.security_level,
        authProtocol: credential.auth_protocol,
        authPassword,
        privProtocol: credential.priv_protocol,
        privPassword,
        contextName: credential.context_name,
        contextEngineId: credential.context_engine_id,
      });

      if (!testResult.success) {
        return {
          success: false,
          data: {
            tested: true,
            targetIp: body.targetIp,
            port: body.port,
            credentialId: id,
            credentialName: credential.name,
            responseTimeMs: testResult.responseTimeMs,
            error: testResult.error,
          },
        };
      }

      return {
        success: true,
        data: {
          tested: true,
          targetIp: body.targetIp,
          port: body.port,
          credentialId: id,
          credentialName: credential.name,
          responseTimeMs: testResult.responseTimeMs,
          sysDescr: testResult.sysDescr,
          sysName: testResult.sysName,
          sysUptime: testResult.sysUptime,
          sysContact: testResult.sysContact,
          sysLocation: testResult.sysLocation,
        },
      };
    },
  );

  // Get devices using this credential
  fastify.get(
    "/:id/devices",
    {
      schema: {
        tags: ["NPM - SNMPv3 Credentials"],
        summary: "Get devices using credential",
        description:
          "List all devices that are configured to use this SNMPv3 credential.",
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

      // Verify credential exists
      const credResult = await pool.query(
        "SELECT id, name FROM npm.snmpv3_credentials WHERE id = $1",
        [id],
      );

      if (credResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Credential not found" },
        };
      }

      const devicesResult = await pool.query(
        `SELECT id, name, ip_address, device_type, vendor, status
       FROM npm.devices
       WHERE snmpv3_credential_id = $1
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
          devices: devicesResult.rows.map((row) => ({
            id: row.id,
            name: row.name,
            ipAddress: row.ip_address,
            deviceType: row.device_type,
            vendor: row.vendor,
            status: row.status,
          })),
          totalDevices: devicesResult.rows.length,
        },
      };
    },
  );
};

export default snmpv3CredentialsRoutes;
