/**
 * NetNynja Enterprise - STIG Manager API Routes
 */

import type { FastifyPluginAsync } from "fastify";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { pool } from "../../db";
import { logger } from "../../logger";
import { XMLParser } from "fast-xml-parser";
import * as unzipper from "unzipper";
import sshCredentialsRoutes from "./ssh-credentials";

// Zod schemas
const targetSchema = z.object({
  name: z.string().min(1).max(255),
  ipAddress: z.string().ip(),
  platform: z.string().max(100),
  osVersion: z.string().max(100).optional(),
  connectionType: z.enum(["ssh", "netmiko", "winrm", "api"]),
  credentialId: z.string().max(255).optional(),
  sshCredentialId: z.string().uuid().optional().nullable(),
  port: z.number().int().min(1).max(65535).optional(),
  isActive: z.boolean().default(true),
});

const updateTargetSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  ipAddress: z.string().ip().optional(),
  platform: z.string().max(100).optional(),
  osVersion: z.string().max(100).optional(),
  connectionType: z.enum(["ssh", "netmiko", "winrm", "api"]).optional(),
  credentialId: z.string().max(255).optional(),
  sshCredentialId: z.string().uuid().optional().nullable(),
  port: z.number().int().min(1).max(65535).optional(),
  isActive: z.boolean().optional(),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

// Helper function to process a single STIG from a zip directory
async function processSingleSTIG(
  directory: unzipper.CentralDirectory,
  filename: string,
  dbPool: typeof pool,
  log: typeof logger,
): Promise<{
  stigId: string;
  title: string;
  rulesCount: number;
  definitionId: string;
}> {
  let xccdfContent: string | null = null;

  // Find the XCCDF XML file in the ZIP
  for (const file of directory.files) {
    if (
      file.path.endsWith(".xml") &&
      (file.path.includes("xccdf") ||
        file.path.includes("XCCDF") ||
        file.path.includes("Manual-xccdf") ||
        file.path.includes("manual-xccdf"))
    ) {
      const buffer = await file.buffer();
      xccdfContent = buffer.toString("utf-8");
      break;
    }
  }

  // If no XCCDF found, try any XML file
  if (!xccdfContent) {
    for (const file of directory.files) {
      if (file.path.endsWith(".xml") && !file.path.includes("__MACOSX")) {
        const buffer = await file.buffer();
        xccdfContent = buffer.toString("utf-8");
        break;
      }
    }
  }

  if (!xccdfContent) {
    throw new Error("No XCCDF XML file found in the ZIP");
  }

  // Parse the XCCDF XML
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => ["Rule", "Group", "Profile"].includes(name),
  });
  const xccdf = parser.parse(xccdfContent);

  // Extract benchmark information
  const benchmark =
    xccdf.Benchmark ||
    xccdf["cdf:Benchmark"] ||
    xccdf["xccdf:Benchmark"] ||
    Object.values(xccdf)[0];

  if (!benchmark) {
    throw new Error("Invalid XCCDF format: no Benchmark element found");
  }

  // Extract STIG info
  const stigId = benchmark["@_id"] || filename.replace(".zip", "");
  const title =
    benchmark.title?.["#text"] ||
    benchmark.title ||
    filename.replace(".zip", "").replace(/_/g, " ");
  const description =
    benchmark.description?.["#text"] || benchmark.description || "";
  const version =
    benchmark.version?.["#text"] ||
    benchmark.version ||
    benchmark["@_version"] ||
    "1.0";

  // Extract platform from the title or metadata
  let platform = "unknown";
  const titleLower = (title || "").toLowerCase();
  if (titleLower.includes("windows")) platform = "windows";
  else if (titleLower.includes("red hat") || titleLower.includes("rhel"))
    platform = "rhel";
  else if (titleLower.includes("ubuntu")) platform = "ubuntu";
  else if (titleLower.includes("cisco")) platform = "cisco_ios";
  else if (titleLower.includes("linux")) platform = "linux";
  else if (titleLower.includes("oracle")) platform = "oracle";
  else if (titleLower.includes("docker")) platform = "docker";
  else if (titleLower.includes("kubernetes") || titleLower.includes("k8s"))
    platform = "kubernetes";
  else if (titleLower.includes("juniper")) platform = "juniper_junos";
  else if (titleLower.includes("palo alto")) platform = "paloalto";
  else if (titleLower.includes("fortinet") || titleLower.includes("fortigate"))
    platform = "fortinet";

  // Extract rules
  const rules: Array<{
    ruleId: string;
    title: string;
    severity: string;
    description: string;
    fixText: string;
    checkText: string;
  }> = [];

  // Find rules in Groups or directly in Benchmark
  const groups = benchmark.Group || [];
  for (const group of groups) {
    const groupRules = group.Rule || [];
    for (const rule of groupRules) {
      const ruleId = rule["@_id"] || `rule-${rules.length}`;
      let severity = rule["@_severity"] || "medium";

      // Map STIG severity values
      if (severity === "high" || severity === "CAT I") severity = "high";
      else if (severity === "medium" || severity === "CAT II")
        severity = "medium";
      else if (severity === "low" || severity === "CAT III") severity = "low";

      rules.push({
        ruleId,
        title: rule.title?.["#text"] || rule.title || "",
        severity,
        description: rule.description?.["#text"] || rule.description || "",
        fixText: rule.fixtext?.["#text"] || rule.fixtext || "",
        checkText:
          rule.check?.["check-content"]?.["#text"] ||
          rule.check?.["check-content"] ||
          "",
      });
    }
  }

  // Check if STIG already exists
  const existingResult = await dbPool.query(
    "SELECT id FROM stig.definitions WHERE stig_id = $1",
    [stigId],
  );

  let definitionId: string;

  if (existingResult.rows.length > 0) {
    // Update existing definition
    definitionId = existingResult.rows[0].id;
    await dbPool.query(
      `UPDATE stig.definitions
       SET title = $1, version = $2, platform = $3, description = $4, updated_at = NOW()
       WHERE id = $5`,
      [title, version, platform, description, definitionId],
    );

    // Delete existing rules and re-insert
    await dbPool.query(
      "DELETE FROM stig.definition_rules WHERE definition_id = $1",
      [definitionId],
    );
  } else {
    // Insert new definition (xccdf_content omitted - rules are stored in definition_rules table)
    const insertResult = await dbPool.query(
      `INSERT INTO stig.definitions (stig_id, title, version, platform, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [stigId, title, version, platform, description],
    );
    definitionId = insertResult.rows[0].id;
  }

  // Insert rules
  for (const rule of rules) {
    await dbPool.query(
      `INSERT INTO stig.definition_rules
       (definition_id, rule_id, title, severity, description, fix_text, check_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (definition_id, rule_id) DO UPDATE SET
         title = EXCLUDED.title,
         severity = EXCLUDED.severity,
         description = EXCLUDED.description,
         fix_text = EXCLUDED.fix_text,
         check_text = EXCLUDED.check_text`,
      [
        definitionId,
        rule.ruleId,
        rule.title,
        rule.severity,
        rule.description,
        rule.fixText,
        rule.checkText,
      ],
    );
  }

  log.info(
    { stigId, title, rulesCount: rules.length },
    "STIG processed successfully",
  );

  return {
    stigId,
    title,
    rulesCount: rules.length,
    definitionId,
  };
}

const stigRoutes: FastifyPluginAsync = async (fastify) => {
  // Require authentication for all STIG routes
  fastify.addHook("preHandler", fastify.requireAuth);

  // Register SSH credentials routes
  fastify.register(sshCredentialsRoutes, { prefix: "/ssh-credentials" });

  // Register audit routes (proxy to STIG service)
  fastify.register(auditRoutes, { prefix: "/audits" });

  // Register target routes (config analysis proxied to STIG service)
  fastify.register(targetRoutes, { prefix: "/targets" });

  // Register target-STIG assignment routes (STIG-13: Multi-STIG Support)
  fastify.register(targetDefinitionRoutes, { prefix: "/targets" });

  // Register audit group routes (STIG-13: Multi-STIG Support)
  fastify.register(auditGroupRoutes, { prefix: "/audit-groups" });

  // =============================================================================
  // Report Routes
  // =============================================================================

  // POST /reports/generate - Generate a report
  fastify.post("/reports/generate", async (request, reply) => {
    try {
      const result = await proxyToSTIGService(
        "/api/v1/stig/reports/generate",
        "POST",
        request.body as string,
        request.headers.authorization,
      );
      reply.status(result.status);
      return result.data;
    } catch (err) {
      logger.error(
        { err },
        "Failed to proxy report generation to STIG service",
      );
      reply.status(502);
      return {
        success: false,
        error: { code: "BAD_GATEWAY", message: "STIG service unavailable" },
      };
    }
  });

  // GET /reports/download/:jobId - Download a report
  fastify.get<{
    Params: { jobId: string };
    Querystring: { format?: string };
  }>("/reports/download/:jobId", async (request, reply) => {
    const { jobId } = request.params;
    const format = request.query.format || "pdf";

    try {
      const { config } = await import("../../config");
      const url = `${config.STIG_SERVICE_URL}/api/v1/stig/reports/download/${jobId}?format=${format}`;
      logger.info({ url, jobId, format }, "Proxying report download request");

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: request.headers.authorization || "",
        },
      });

      logger.info(
        { status: response.status, ok: response.ok },
        "STIG service response received",
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn(
          { status: response.status, errorText },
          "STIG service returned error",
        );
        let errorMessage = "Failed to download report";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          // Not JSON, use raw text
          if (errorText) errorMessage = errorText;
        }
        reply.status(response.status);
        return {
          success: false,
          error: {
            code: "REPORT_DOWNLOAD_FAILED",
            message: errorMessage,
          },
        };
      }

      // Get content type and filename from response headers
      const contentType =
        response.headers.get("content-type") || "application/octet-stream";
      const contentDisposition =
        response.headers.get("content-disposition") || "";
      logger.info(
        { contentType, contentDisposition },
        "Report response headers",
      );

      // Extract filename from content-disposition header
      const filenameMatch = contentDisposition.match(/filename="?([^";\n]+)"?/);
      const filename = filenameMatch
        ? filenameMatch[1]
        : `report_${jobId}.${format}`;

      // Stream the file response
      const buffer = await response.arrayBuffer();
      logger.info(
        { bufferSize: buffer.byteLength, filename },
        "Sending report file",
      );

      reply
        .header("Content-Type", contentType)
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(Buffer.from(buffer));
      return reply;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;
      logger.error(
        { err, errorMessage, errorStack },
        "Failed to proxy report download to STIG service",
      );
      reply.status(502);
      return {
        success: false,
        error: { code: "BAD_GATEWAY", message: "STIG service unavailable" },
      };
    }
  });

  // GET /reports/combined-pdf - Download combined PDF from multiple jobs
  fastify.get<{
    Querystring: { job_ids: string };
  }>("/reports/combined-pdf", async (request, reply) => {
    const jobIds = request.query.job_ids;

    if (!jobIds) {
      reply.status(400);
      return {
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "job_ids parameter is required",
        },
      };
    }

    try {
      const { config } = await import("../../config");
      const url = `${config.STIG_SERVICE_URL}/api/v1/stig/reports/combined-pdf?job_ids=${encodeURIComponent(jobIds)}`;
      logger.info({ url, jobIds }, "Proxying combined PDF download request");

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: request.headers.authorization || "",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn(
          { status: response.status, errorText },
          "STIG service returned error",
        );
        let errorMessage = "Failed to download combined PDF";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          if (errorText) errorMessage = errorText;
        }
        reply.status(response.status);
        return {
          success: false,
          error: { code: "REPORT_DOWNLOAD_FAILED", message: errorMessage },
        };
      }

      const contentType =
        response.headers.get("content-type") || "application/pdf";
      const contentDisposition =
        response.headers.get("content-disposition") || "";
      const filenameMatch = contentDisposition.match(/filename="?([^";\n]+)"?/);
      const filename = filenameMatch
        ? filenameMatch[1]
        : "Combined_STIG_Report.pdf";

      const buffer = await response.arrayBuffer();
      reply
        .header("Content-Type", contentType)
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(Buffer.from(buffer));
      return reply;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(
        { err, errorMessage },
        "Failed to proxy combined PDF download",
      );
      reply.status(502);
      return {
        success: false,
        error: { code: "BAD_GATEWAY", message: "STIG service unavailable" },
      };
    }
  });

  // GET /reports/combined-ckl - Download combined CKL ZIP from multiple jobs
  fastify.get<{
    Querystring: { job_ids: string };
  }>("/reports/combined-ckl", async (request, reply) => {
    const jobIds = request.query.job_ids;

    if (!jobIds) {
      reply.status(400);
      return {
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "job_ids parameter is required",
        },
      };
    }

    try {
      const { config } = await import("../../config");
      const url = `${config.STIG_SERVICE_URL}/api/v1/stig/reports/combined-ckl?job_ids=${encodeURIComponent(jobIds)}`;
      logger.info({ url, jobIds }, "Proxying combined CKL download request");

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: request.headers.authorization || "",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn(
          { status: response.status, errorText },
          "STIG service returned error",
        );
        let errorMessage = "Failed to download combined CKL";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          if (errorText) errorMessage = errorText;
        }
        reply.status(response.status);
        return {
          success: false,
          error: { code: "REPORT_DOWNLOAD_FAILED", message: errorMessage },
        };
      }

      const contentType =
        response.headers.get("content-type") || "application/zip";
      const contentDisposition =
        response.headers.get("content-disposition") || "";
      const filenameMatch = contentDisposition.match(/filename="?([^";\n]+)"?/);
      const filename = filenameMatch ? filenameMatch[1] : "STIG_Checklists.zip";

      const buffer = await response.arrayBuffer();
      reply
        .header("Content-Type", contentType)
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(Buffer.from(buffer));
      return reply;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(
        { err, errorMessage },
        "Failed to proxy combined CKL download",
      );
      reply.status(502);
      return {
        success: false,
        error: { code: "BAD_GATEWAY", message: "STIG service unavailable" },
      };
    }
  });

  // List STIG definitions (benchmarks)
  fastify.get(
    "/benchmarks",
    {
      schema: {
        tags: ["STIG - Benchmarks"],
        summary: "List available STIG definitions",
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
        ? `WHERE title ILIKE $3 OR stig_id ILIKE $3`
        : "";
      const searchParam = query.search ? `%${query.search}%` : null;

      const countQuery = `SELECT COUNT(*) FROM stig.definitions ${searchCondition}`;
      const dataQuery = `
      SELECT id, stig_id, title, version, release_date, platform, description, created_at, updated_at
      FROM stig.definitions
      ${searchCondition}
      ORDER BY title
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
          stigId: row.stig_id,
          title: row.title,
          version: row.version,
          releaseDate: row.release_date,
          platform: row.platform,
          description: row.description,
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

  // Get definition by ID
  fastify.get(
    "/benchmarks/:id",
    {
      schema: {
        tags: ["STIG - Benchmarks"],
        summary: "Get STIG definition by ID",
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
        `SELECT id, stig_id, title, version, release_date, platform, description, created_at, updated_at
       FROM stig.definitions WHERE id = $1`,
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Definition not found" },
        };
      }

      const row = result.rows[0];
      return {
        success: true,
        data: {
          id: row.id,
          stigId: row.stig_id,
          title: row.title,
          version: row.version,
          releaseDate: row.release_date,
          platform: row.platform,
          description: row.description,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // List targets (assets)
  fastify.get(
    "/assets",
    {
      schema: {
        tags: ["STIG - Assets"],
        summary: "List audit targets",
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
        ? `WHERE name ILIKE $3 OR ip_address::text ILIKE $3`
        : "";
      const searchParam = query.search ? `%${query.search}%` : null;

      const countQuery = `SELECT COUNT(*) FROM stig.targets ${searchCondition}`;
      const dataQuery = `
      SELECT t.id, t.name, t.ip_address, t.platform, t.os_version, t.connection_type, t.port, t.is_active, t.last_audit, t.ssh_credential_id, t.created_at, t.updated_at,
             sc.name as ssh_credential_name
      FROM stig.targets t
      LEFT JOIN stig.ssh_credentials sc ON t.ssh_credential_id = sc.id
      ${searchCondition.replace("name", "t.name").replace("ip_address", "t.ip_address")}
      ORDER BY t.name
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
          name: row.name,
          ipAddress: row.ip_address,
          platform: row.platform,
          osVersion: row.os_version,
          connectionType: row.connection_type,
          port: row.port,
          isActive: row.is_active,
          lastAudit: row.last_audit,
          sshCredentialId: row.ssh_credential_id,
          sshCredentialName: row.ssh_credential_name,
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

  // Create target
  fastify.post(
    "/assets",
    {
      schema: {
        tags: ["STIG - Assets"],
        summary: "Create a new audit target",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["name", "ipAddress", "platform", "connectionType"],
          properties: {
            name: { type: "string" },
            ipAddress: { type: "string" },
            platform: { type: "string" },
            osVersion: { type: "string" },
            connectionType: {
              type: "string",
              enum: ["ssh", "netmiko", "winrm", "api"],
            },
            credentialId: { type: "string" },
            sshCredentialId: { type: "string", format: "uuid" },
            port: { type: "number" },
            isActive: { type: "boolean" },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const body = targetSchema.parse(request.body);

      const result = await pool.query(
        `INSERT INTO stig.targets (name, ip_address, platform, os_version, connection_type, credential_id, ssh_credential_id, port, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, ip_address, platform, os_version, connection_type, ssh_credential_id, port, is_active, created_at, updated_at`,
        [
          body.name,
          body.ipAddress,
          body.platform,
          body.osVersion,
          body.connectionType,
          body.credentialId,
          body.sshCredentialId,
          body.port,
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
          platform: row.platform,
          osVersion: row.os_version,
          connectionType: row.connection_type,
          sshCredentialId: row.ssh_credential_id,
          port: row.port,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Update target
  fastify.patch(
    "/assets/:id",
    {
      schema: {
        tags: ["STIG - Assets"],
        summary: "Update an audit target",
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
            platform: { type: "string" },
            osVersion: { type: "string" },
            connectionType: {
              type: "string",
              enum: ["ssh", "netmiko", "winrm", "api"],
            },
            credentialId: { type: "string" },
            sshCredentialId: { type: "string", format: "uuid" },
            port: { type: "number" },
            isActive: { type: "boolean" },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateTargetSchema.parse(request.body);

      // Check if target exists
      const existingResult = await pool.query(
        "SELECT id FROM stig.targets WHERE id = $1",
        [id],
      );

      if (existingResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Target not found" },
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
      if (body.ipAddress !== undefined) {
        updates.push(`ip_address = $${paramIndex++}`);
        params.push(body.ipAddress);
      }
      if (body.platform !== undefined) {
        updates.push(`platform = $${paramIndex++}`);
        params.push(body.platform);
      }
      if (body.osVersion !== undefined) {
        updates.push(`os_version = $${paramIndex++}`);
        params.push(body.osVersion);
      }
      if (body.connectionType !== undefined) {
        updates.push(`connection_type = $${paramIndex++}`);
        params.push(body.connectionType);
      }
      if (body.credentialId !== undefined) {
        updates.push(`credential_id = $${paramIndex++}`);
        params.push(body.credentialId);
      }
      if (body.sshCredentialId !== undefined) {
        updates.push(`ssh_credential_id = $${paramIndex++}`);
        params.push(body.sshCredentialId);
      }
      if (body.port !== undefined) {
        updates.push(`port = $${paramIndex++}`);
        params.push(body.port);
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
        `UPDATE stig.targets
         SET ${updates.join(", ")}
         WHERE id = $${paramIndex}
         RETURNING id, name, ip_address, platform, os_version, connection_type, ssh_credential_id, port, is_active, last_audit, created_at, updated_at`,
        params,
      );

      const row = result.rows[0];
      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          ipAddress: row.ip_address,
          platform: row.platform,
          osVersion: row.os_version,
          connectionType: row.connection_type,
          sshCredentialId: row.ssh_credential_id,
          port: row.port,
          isActive: row.is_active,
          lastAudit: row.last_audit,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Delete target
  fastify.delete(
    "/assets/:id",
    {
      schema: {
        tags: ["STIG - Assets"],
        summary: "Delete an audit target",
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
        "DELETE FROM stig.targets WHERE id = $1 RETURNING id",
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Target not found" },
        };
      }

      return reply.status(204).send();
    },
  );

  // Get audit results for a target
  fastify.get(
    "/assets/:id/findings",
    {
      schema: {
        tags: ["STIG - Compliance"],
        summary: "Get audit results for a target",
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
            status: {
              type: "string",
              enum: ["pass", "fail", "not_applicable", "not_reviewed", "error"],
            },
            severity: { type: "string", enum: ["high", "medium", "low"] },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = querySchema.parse(request.query);
      const offset = (query.page - 1) * query.limit;

      // Get audit results for the target via audit_jobs
      const result = await pool.query(
        `SELECT ar.id, ar.rule_id, ar.title, ar.severity, ar.status, ar.finding_details,
              ar.comments, ar.checked_at, j.name as job_name, j.completed_at as job_completed_at
       FROM stig.audit_results ar
       JOIN stig.audit_jobs j ON ar.job_id = j.id
       WHERE j.target_id = $1
       ORDER BY ar.severity, ar.rule_id
       LIMIT $2 OFFSET $3`,
        [id, query.limit, offset],
      );

      return {
        success: true,
        data: result.rows.map((row) => ({
          id: row.id,
          ruleId: row.rule_id,
          title: row.title,
          severity: row.severity,
          status: row.status,
          findingDetails: row.finding_details,
          comments: row.comments,
          checkedAt: row.checked_at,
          jobName: row.job_name,
          jobCompletedAt: row.job_completed_at,
        })),
      };
    },
  );

  // Get compliance summary
  fastify.get(
    "/compliance/summary",
    {
      schema: {
        tags: ["STIG - Compliance"],
        summary: "Get overall compliance summary",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const result = await pool.query(`
      SELECT
        COUNT(DISTINCT t.id) as total_targets,
        COUNT(ar.id) as total_results,
        COUNT(CASE WHEN ar.status = 'fail' THEN 1 END) as failed_checks,
        COUNT(CASE WHEN ar.status = 'pass' THEN 1 END) as passed_checks,
        COUNT(CASE WHEN ar.status = 'not_applicable' THEN 1 END) as not_applicable,
        COUNT(CASE WHEN ar.status = 'not_reviewed' THEN 1 END) as not_reviewed,
        COUNT(CASE WHEN ar.status = 'error' THEN 1 END) as errors,
        COUNT(CASE WHEN ar.severity = 'high' AND ar.status = 'fail' THEN 1 END) as high_severity_fails,
        COUNT(CASE WHEN ar.severity = 'medium' AND ar.status = 'fail' THEN 1 END) as medium_severity_fails,
        COUNT(CASE WHEN ar.severity = 'low' AND ar.status = 'fail' THEN 1 END) as low_severity_fails
      FROM stig.targets t
      LEFT JOIN stig.audit_jobs j ON t.id = j.target_id
      LEFT JOIN stig.audit_results ar ON j.id = ar.job_id
    `);

      const row = result.rows[0];
      const totalResults = parseInt(row.total_results, 10) || 0;
      const passedChecks = parseInt(row.passed_checks, 10);
      const complianceScore =
        totalResults > 0
          ? Math.round((passedChecks / totalResults) * 100)
          : 100;

      return {
        success: true,
        data: {
          totalTargets: parseInt(row.total_targets, 10),
          totalResults: totalResults,
          failedChecks: parseInt(row.failed_checks, 10),
          passedChecks: passedChecks,
          notApplicable: parseInt(row.not_applicable, 10),
          notReviewed: parseInt(row.not_reviewed, 10),
          errors: parseInt(row.errors, 10),
          complianceScore,
          bySeverity: {
            high: { failed: parseInt(row.high_severity_fails, 10) },
            medium: { failed: parseInt(row.medium_severity_fails, 10) },
            low: { failed: parseInt(row.low_severity_fails, 10) },
          },
        },
      };
    },
  );

  // ============================================
  // STIG Library - Upload and Manage STIGs
  // ============================================

  // Upload STIG .zip file
  fastify.post(
    "/library/upload",
    {
      schema: {
        tags: ["STIG - Library"],
        summary: "Upload STIG .zip file",
        security: [{ bearerAuth: [] }],
        consumes: ["multipart/form-data"],
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request: FastifyRequest, reply) => {
      const data = await request.file();
      const maxZipFiles = 10000; // Allow full STIG Library (~600+ files)
      const maxUncompressedBytes = 2 * 1024 * 1024 * 1024; // 2 GB uncompressed

      if (!data) {
        reply.status(400);
        return {
          success: false,
          error: { code: "NO_FILE", message: "No file uploaded" },
        };
      }

      if (!data.filename.endsWith(".zip")) {
        reply.status(400);
        return {
          success: false,
          error: { code: "INVALID_FILE", message: "File must be a .zip file" },
        };
      }

      try {
        const chunks: Buffer[] = [];
        for await (const chunk of data.file) {
          chunks.push(chunk as Buffer);
        }
        const fileBuffer = Buffer.concat(chunks);

        // Parse the ZIP file
        const directory = await unzipper.Open.buffer(fileBuffer);
        const fileCount = directory.files.length;
        if (fileCount > maxZipFiles) {
          reply.status(400);
          return {
            success: false,
            error: {
              code: "ZIP_TOO_MANY_FILES",
              message: `ZIP contains too many files (${fileCount}). Max allowed is ${maxZipFiles}.`,
            },
          };
        }

        const totalUncompressedBytes = directory.files.reduce((sum, file) => {
          const uncompressed =
            typeof file.uncompressedSize === "number"
              ? file.uncompressedSize
              : 0;
          return sum + uncompressed;
        }, 0);
        if (totalUncompressedBytes > maxUncompressedBytes) {
          reply.status(400);
          return {
            success: false,
            error: {
              code: "ZIP_TOO_LARGE",
              message: `ZIP uncompressed size exceeds limit (${maxUncompressedBytes} bytes).`,
            },
          };
        }

        // Check if this is a STIG Library (contains nested .zip files)
        const nestedZips = directory.files.filter(
          (f) => f.path.endsWith(".zip") && !f.path.includes("__MACOSX"),
        );

        if (nestedZips.length > 0) {
          // This is a STIG Library - process all nested zips
          logger.info(
            { nestedZipCount: nestedZips.length, filename: data.filename },
            "Processing STIG Library with nested zips",
          );

          const results: Array<{
            stigId: string;
            title: string;
            rulesCount: number;
            status: "success" | "error";
            error?: string;
          }> = [];

          for (const nestedZipFile of nestedZips) {
            try {
              const nestedBuffer = await nestedZipFile.buffer();
              const nestedDir = await unzipper.Open.buffer(nestedBuffer);
              const stigResult = await processSingleSTIG(
                nestedDir,
                nestedZipFile.path,
                pool,
                logger,
              );
              results.push({
                stigId: stigResult.stigId,
                title: stigResult.title,
                rulesCount: stigResult.rulesCount,
                status: "success",
              });
            } catch (err) {
              const errorMessage =
                err instanceof Error ? err.message : "Unknown error";
              logger.warn(
                { nestedZip: nestedZipFile.path, error: errorMessage },
                "Failed to process nested STIG zip",
              );
              results.push({
                stigId: nestedZipFile.path,
                title: nestedZipFile.path,
                rulesCount: 0,
                status: "error",
                error: errorMessage,
              });
            }
          }

          const successCount = results.filter(
            (r) => r.status === "success",
          ).length;
          const errorCount = results.filter((r) => r.status === "error").length;

          return {
            success: true,
            data: {
              type: "library",
              totalProcessed: results.length,
              successCount,
              errorCount,
              stigs: results,
            },
            message: `Successfully imported ${successCount} STIGs from library (${errorCount} errors)`,
          };
        }

        // Single STIG processing
        let xccdfContent: string | null = null;
        let xccdfFilename: string | null = null;

        // Find the XCCDF XML file in the ZIP
        for (const file of directory.files) {
          if (
            file.path.endsWith(".xml") &&
            (file.path.includes("xccdf") ||
              file.path.includes("XCCDF") ||
              file.path.includes("Manual-xccdf") ||
              file.path.includes("manual-xccdf"))
          ) {
            const buffer = await file.buffer();
            xccdfContent = buffer.toString("utf-8");
            xccdfFilename = file.path;
            break;
          }
        }

        // If no XCCDF found, try any XML file
        if (!xccdfContent) {
          for (const file of directory.files) {
            if (file.path.endsWith(".xml") && !file.path.includes("__MACOSX")) {
              const buffer = await file.buffer();
              xccdfContent = buffer.toString("utf-8");
              xccdfFilename = file.path;
              break;
            }
          }
        }

        if (!xccdfContent) {
          reply.status(400);
          return {
            success: false,
            error: {
              code: "NO_XCCDF",
              message: "No XCCDF XML file found in the ZIP",
            },
          };
        }

        // Parse the XCCDF XML
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: "@_",
          isArray: (name) => ["Rule", "Group", "Profile"].includes(name),
        });
        const xccdf = parser.parse(xccdfContent);

        // Extract benchmark information
        const benchmark =
          xccdf.Benchmark ||
          xccdf["cdf:Benchmark"] ||
          xccdf["xccdf:Benchmark"] ||
          Object.values(xccdf)[0];

        if (!benchmark) {
          reply.status(400);
          return {
            success: false,
            error: {
              code: "INVALID_XCCDF",
              message: "Invalid XCCDF format: no Benchmark element found",
            },
          };
        }

        // Extract STIG info
        const stigId = benchmark["@_id"] || data.filename.replace(".zip", "");
        const title =
          benchmark.title?.["#text"] ||
          benchmark.title ||
          data.filename.replace(".zip", "").replace(/_/g, " ");
        const description =
          benchmark.description?.["#text"] || benchmark.description || "";
        const version =
          benchmark.version?.["#text"] ||
          benchmark.version ||
          benchmark["@_version"] ||
          "1.0";

        // Extract platform from the title or metadata
        let platform = "unknown";
        const titleLower = (title || "").toLowerCase();
        if (titleLower.includes("windows")) platform = "windows";
        else if (titleLower.includes("red hat") || titleLower.includes("rhel"))
          platform = "rhel";
        else if (titleLower.includes("ubuntu")) platform = "ubuntu";
        else if (titleLower.includes("cisco")) platform = "cisco_ios";
        else if (titleLower.includes("linux")) platform = "linux";
        else if (titleLower.includes("oracle")) platform = "oracle";
        else if (titleLower.includes("docker")) platform = "docker";
        else if (
          titleLower.includes("kubernetes") ||
          titleLower.includes("k8s")
        )
          platform = "kubernetes";
        else if (titleLower.includes("juniper")) platform = "juniper_junos";
        else if (titleLower.includes("palo alto")) platform = "paloalto";
        else if (
          titleLower.includes("fortinet") ||
          titleLower.includes("fortigate")
        )
          platform = "fortinet";

        // Extract rules
        const rules: Array<{
          ruleId: string;
          title: string;
          severity: string;
          description: string;
          fixText: string;
          checkText: string;
        }> = [];

        // Find rules in Groups or directly in Benchmark
        const groups = benchmark.Group || [];
        for (const group of groups) {
          const groupRules = group.Rule || [];
          for (const rule of groupRules) {
            const ruleId = rule["@_id"] || `rule-${rules.length}`;
            let severity = rule["@_severity"] || "medium";

            // Map STIG severity values
            if (severity === "high" || severity === "CAT I") severity = "high";
            else if (severity === "medium" || severity === "CAT II")
              severity = "medium";
            else if (severity === "low" || severity === "CAT III")
              severity = "low";

            rules.push({
              ruleId,
              title: rule.title?.["#text"] || rule.title || "",
              severity,
              description:
                rule.description?.["#text"] || rule.description || "",
              fixText: rule.fixtext?.["#text"] || rule.fixtext || "",
              checkText:
                rule.check?.["check-content"]?.["#text"] ||
                rule.check?.["check-content"] ||
                "",
            });
          }
        }

        // Check if STIG already exists
        const existingResult = await pool.query(
          "SELECT id FROM stig.definitions WHERE stig_id = $1",
          [stigId],
        );

        let definitionId: string;

        if (existingResult.rows.length > 0) {
          // Update existing definition
          definitionId = existingResult.rows[0].id;
          await pool.query(
            `UPDATE stig.definitions
             SET title = $1, version = $2, platform = $3, description = $4, updated_at = NOW()
             WHERE id = $5`,
            [title, version, platform, description, definitionId],
          );

          // Delete existing rules and re-insert
          await pool.query(
            "DELETE FROM stig.definition_rules WHERE definition_id = $1",
            [definitionId],
          );
        } else {
          // Insert new definition (xccdf_content omitted - rules are stored in definition_rules table)
          const insertResult = await pool.query(
            `INSERT INTO stig.definitions (stig_id, title, version, platform, description)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [stigId, title, version, platform, description],
          );
          definitionId = insertResult.rows[0].id;
        }

        // Insert rules
        for (const rule of rules) {
          await pool.query(
            `INSERT INTO stig.definition_rules
             (definition_id, rule_id, title, severity, description, fix_text, check_text)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (definition_id, rule_id) DO UPDATE SET
               title = EXCLUDED.title,
               severity = EXCLUDED.severity,
               description = EXCLUDED.description,
               fix_text = EXCLUDED.fix_text,
               check_text = EXCLUDED.check_text`,
            [
              definitionId,
              rule.ruleId,
              rule.title,
              rule.severity,
              rule.description,
              rule.fixText,
              rule.checkText,
            ],
          );
        }

        logger.info(
          {
            stigId,
            title,
            rulesCount: rules.length,
            filename: data.filename,
          },
          "STIG uploaded successfully",
        );

        return {
          success: true,
          data: {
            id: definitionId,
            stigId,
            title,
            version,
            platform,
            rulesCount: rules.length,
          },
          message: `Successfully imported STIG with ${rules.length} rules`,
        };
      } catch (err) {
        logger.error(
          { err, filename: data.filename },
          "Failed to process STIG file",
        );
        reply.status(500);
        return {
          success: false,
          error: {
            code: "PROCESSING_ERROR",
            message:
              err instanceof Error
                ? err.message
                : "Failed to process STIG file",
          },
        };
      }
    },
  );

  // Get STIG definition with rules
  fastify.get(
    "/library/:id/rules",
    {
      schema: {
        tags: ["STIG - Library"],
        summary: "Get STIG rules",
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
            severity: { type: "string", enum: ["high", "medium", "low"] },
            search: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = querySchema.parse(request.query);
      const { severity, search } = request.query as {
        severity?: string;
        search?: string;
      };
      const offset = (query.page - 1) * query.limit;

      // Build WHERE clause
      const conditions = ["definition_id = $1"];
      const params: (string | number)[] = [id];
      let paramIndex = 2;

      if (severity) {
        conditions.push(`severity = $${paramIndex++}`);
        params.push(severity);
      }
      if (search) {
        conditions.push(
          `(title ILIKE $${paramIndex} OR rule_id ILIKE $${paramIndex})`,
        );
        params.push(`%${search}%`);
        paramIndex++;
      }

      const whereClause = conditions.join(" AND ");

      const countResult = await pool.query(
        `SELECT COUNT(*) FROM stig.definition_rules WHERE ${whereClause}`,
        params,
      );

      const dataResult = await pool.query(
        `SELECT id, rule_id, title, severity, description, fix_text, check_text
         FROM stig.definition_rules
         WHERE ${whereClause}
         ORDER BY
           CASE severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
           rule_id
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, query.limit, offset],
      );

      return {
        success: true,
        data: dataResult.rows.map((row) => ({
          id: row.id,
          ruleId: row.rule_id,
          title: row.title,
          severity: row.severity,
          description: row.description,
          fixText: row.fix_text,
          checkText: row.check_text,
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

  // Delete STIG definition
  fastify.delete(
    "/library/:id",
    {
      schema: {
        tags: ["STIG - Library"],
        summary: "Delete STIG definition",
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
        "DELETE FROM stig.definitions WHERE id = $1 RETURNING id, stig_id",
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "STIG definition not found" },
        };
      }

      logger.info(
        { id, stigId: result.rows[0].stig_id },
        "STIG definition deleted",
      );

      return reply.status(204).send();
    },
  );

  // ============================================
  // Checklist Import (.ckl, .cklb, .xml)
  // ============================================

  // Import checklist file
  fastify.post(
    "/import/checklist",
    {
      schema: {
        tags: ["STIG - Import"],
        summary: "Import STIG checklist (.ckl, .cklb, .xml)",
        security: [{ bearerAuth: [] }],
        consumes: ["multipart/form-data"],
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request: FastifyRequest, reply) => {
      const data = await request.file();

      if (!data) {
        reply.status(400);
        return {
          success: false,
          error: { code: "NO_FILE", message: "No file uploaded" },
        };
      }

      const filename = data.filename.toLowerCase();
      const isCKL = filename.endsWith(".ckl") || filename.endsWith(".xml");
      const isCKLB = filename.endsWith(".cklb");

      if (!isCKL && !isCKLB) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "INVALID_FILE",
            message: "File must be .ckl, .cklb, or .xml",
          },
        };
      }

      try {
        const chunks: Buffer[] = [];
        for await (const chunk of data.file) {
          chunks.push(chunk as Buffer);
        }
        const fileBuffer = Buffer.concat(chunks);

        let checklistData: {
          assetName: string;
          ipAddress: string;
          hostName: string;
          stigId: string;
          stigTitle: string;
          releaseInfo: string;
          results: Array<{
            ruleId: string;
            status: string;
            findingDetails: string;
            comments: string;
            severity: string;
          }>;
        };

        if (isCKLB) {
          // CKLB is JSON-based (new STIG Viewer format)
          const jsonContent = fileBuffer.toString("utf-8");
          const cklb = JSON.parse(jsonContent);

          checklistData = {
            assetName:
              cklb.target_data?.host_name ||
              cklb.asset?.computing_system ||
              "Unknown",
            ipAddress:
              cklb.target_data?.target_ip ||
              cklb.asset?.ip_address ||
              "0.0.0.0",
            hostName: cklb.target_data?.host_name || "",
            stigId: cklb.stigs?.[0]?.stig_id || "Unknown",
            stigTitle:
              cklb.stigs?.[0]?.stig_name || cklb.title || "Unknown STIG",
            releaseInfo: cklb.stigs?.[0]?.release_info || "",
            results: [],
          };

          // Parse CKLB results
          const stigs = cklb.stigs || [];
          for (const stig of stigs) {
            const rules = stig.rules || [];
            for (const rule of rules) {
              checklistData.results.push({
                ruleId: rule.rule_id || rule.group_id || "",
                status: mapCKLStatus(rule.status || "Not_Reviewed"),
                findingDetails: rule.finding_details || "",
                comments: rule.comments || "",
                severity: mapCKLSeverity(rule.severity || "medium"),
              });
            }
          }
        } else {
          // CKL/XML is XML-based (classic STIG Viewer format)
          const xmlContent = fileBuffer.toString("utf-8");
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            isArray: (name) =>
              ["VULN", "STIG_DATA", "ATTRIBUTE_DATA", "SI_DATA"].includes(name),
          });
          const ckl = parser.parse(xmlContent);

          const checklist = ckl.CHECKLIST || ckl;
          const asset = checklist.ASSET || {};
          const stigs = checklist.STIGS?.iSTIG || checklist.STIGS || [];
          const stigInfo = Array.isArray(stigs) ? stigs[0] : stigs;
          const stigInfoData = stigInfo?.STIG_INFO?.SI_DATA || [];

          // Extract STIG info from SI_DATA
          let stigId = "Unknown";
          let stigTitle = "Unknown STIG";
          let releaseInfo = "";

          if (Array.isArray(stigInfoData)) {
            for (const siData of stigInfoData) {
              const name = siData?.SID_NAME || "";
              const dataVal = siData?.SID_DATA || "";
              if (name === "stigid") stigId = dataVal;
              else if (name === "title") stigTitle = dataVal;
              else if (name === "releaseinfo") releaseInfo = dataVal;
            }
          }

          checklistData = {
            assetName: asset.HOST_NAME || asset.ASSET_TYPE || "Unknown",
            ipAddress: asset.HOST_IP || "0.0.0.0",
            hostName: asset.HOST_NAME || "",
            stigId,
            stigTitle,
            releaseInfo,
            results: [],
          };

          // Parse CKL vulnerabilities
          const vulns = stigInfo?.VULN || [];
          for (const vuln of vulns) {
            const stigData = vuln.STIG_DATA || [];
            let ruleId = "";
            let severity = "medium";

            for (const sd of stigData) {
              const name = sd?.VULN_ATTRIBUTE || "";
              const dataVal = sd?.ATTRIBUTE_DATA || "";
              if (name === "Rule_ID") ruleId = dataVal;
              else if (name === "Severity") severity = dataVal;
            }

            checklistData.results.push({
              ruleId,
              status: mapCKLStatus(vuln.STATUS || "Not_Reviewed"),
              findingDetails: vuln.FINDING_DETAILS || "",
              comments: vuln.COMMENTS || "",
              severity: mapCKLSeverity(severity),
            });
          }
        }

        // Find or create target
        let targetId: string;
        const existingTarget = await pool.query(
          "SELECT id FROM stig.targets WHERE name = $1 OR ip_address = $2::inet",
          [checklistData.assetName, checklistData.ipAddress],
        );

        if (existingTarget.rows.length > 0) {
          targetId = existingTarget.rows[0].id;
        } else {
          // Create new target
          const insertTarget = await pool.query(
            `INSERT INTO stig.targets (name, ip_address, platform, connection_type)
             VALUES ($1, $2::inet, $3, 'ssh')
             RETURNING id`,
            [checklistData.assetName, checklistData.ipAddress, "unknown"],
          );
          targetId = insertTarget.rows[0].id;
        }

        // Find or create STIG definition
        let definitionId: string;
        const existingDef = await pool.query(
          "SELECT id FROM stig.definitions WHERE stig_id = $1",
          [checklistData.stigId],
        );

        if (existingDef.rows.length > 0) {
          definitionId = existingDef.rows[0].id;
        } else {
          // Create placeholder definition
          const insertDef = await pool.query(
            `INSERT INTO stig.definitions (stig_id, title, version, platform, description)
             VALUES ($1, $2, $3, 'unknown', 'Imported from checklist')
             RETURNING id`,
            [
              checklistData.stigId,
              checklistData.stigTitle,
              checklistData.releaseInfo,
            ],
          );
          definitionId = insertDef.rows[0].id;
        }

        // Create audit job for the import
        const userId = (request as unknown as { user: { id: string } }).user
          ?.id;
        const jobResult = await pool.query(
          `INSERT INTO stig.audit_jobs (name, target_id, definition_id, status, started_at, completed_at, created_by)
           VALUES ($1, $2, $3, 'completed', NOW(), NOW(), $4)
           RETURNING id`,
          [`Imported from ${data.filename}`, targetId, definitionId, userId],
        );
        const jobId = jobResult.rows[0].id;

        // Insert audit results
        let importedCount = 0;
        for (const result of checklistData.results) {
          if (result.ruleId) {
            await pool.query(
              `INSERT INTO stig.audit_results (job_id, rule_id, title, severity, status, finding_details, comments)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT DO NOTHING`,
              [
                jobId,
                result.ruleId,
                result.ruleId,
                result.severity,
                result.status,
                result.findingDetails,
                result.comments,
              ],
            );
            importedCount++;
          }
        }

        // Update target last_audit
        await pool.query(
          "UPDATE stig.targets SET last_audit = NOW() WHERE id = $1",
          [targetId],
        );

        logger.info(
          {
            filename: data.filename,
            targetId,
            definitionId,
            jobId,
            importedCount,
          },
          "Checklist imported successfully",
        );

        return {
          success: true,
          data: {
            jobId,
            targetId,
            definitionId,
            assetName: checklistData.assetName,
            stigTitle: checklistData.stigTitle,
            importedResults: importedCount,
          },
          message: `Successfully imported ${importedCount} results from checklist`,
        };
      } catch (err) {
        logger.error(
          { err, filename: data.filename },
          "Failed to import checklist",
        );
        reply.status(500);
        return {
          success: false,
          error: {
            code: "IMPORT_ERROR",
            message:
              err instanceof Error ? err.message : "Failed to import checklist",
          },
        };
      }
    },
  );

  // List imported checklists (audit jobs)
  fastify.get(
    "/import/history",
    {
      schema: {
        tags: ["STIG - Import"],
        summary: "List imported checklists",
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

      const countResult = await pool.query(
        "SELECT COUNT(*) FROM stig.audit_jobs WHERE name LIKE 'Imported from%'",
      );

      const dataResult = await pool.query(
        `SELECT j.id, j.name, j.status, j.completed_at,
                t.name as target_name, t.ip_address as target_ip,
                d.title as stig_title,
                (SELECT COUNT(*) FROM stig.audit_results WHERE job_id = j.id) as results_count
         FROM stig.audit_jobs j
         LEFT JOIN stig.targets t ON j.target_id = t.id
         LEFT JOIN stig.definitions d ON j.definition_id = d.id
         WHERE j.name LIKE 'Imported from%'
         ORDER BY j.completed_at DESC
         LIMIT $1 OFFSET $2`,
        [query.limit, offset],
      );

      return {
        success: true,
        data: dataResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status,
          completedAt: row.completed_at,
          targetName: row.target_name,
          targetIp: row.target_ip,
          stigTitle: row.stig_title,
          resultsCount: parseInt(row.results_count, 10),
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
};

// =============================================================================
// Target-STIG Assignment Routes (STIG-13: Multi-STIG Support)
// =============================================================================

// Zod schemas for target-STIG assignments
const targetDefinitionCreateSchema = z.object({
  definitionId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
  enabled: z.boolean().default(true),
  notes: z.string().optional(),
});

const targetDefinitionUpdateSchema = z.object({
  isPrimary: z.boolean().optional(),
  enabled: z.boolean().optional(),
  notes: z.string().optional(),
});

const bulkAssignmentSchema = z.object({
  definitionIds: z.array(z.string().uuid()).min(1),
  primaryId: z.string().uuid().optional(),
});

const auditAllSchema = z.object({
  definitionIds: z.array(z.string().uuid()).optional(),
  name: z.string().optional(),
});

const targetDefinitionRoutes: FastifyPluginAsync = async (fastify) => {
  // List STIGs assigned to a target
  fastify.get<{
    Params: { targetId: string };
    Querystring: { includeCompliance?: boolean };
  }>(
    "/:targetId/definitions",
    {
      schema: {
        tags: ["STIG - Target Assignments"],
        summary: "List STIG definitions assigned to a target",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            targetId: { type: "string", format: "uuid" },
          },
          required: ["targetId"],
        },
        querystring: {
          type: "object",
          properties: {
            includeCompliance: { type: "boolean", default: false },
          },
        },
      },
      preHandler: [fastify.requireAuth],
    },
    async (request, reply) => {
      const { targetId } = request.params;
      const includeCompliance = request.query.includeCompliance ?? false;

      // Verify target exists
      const targetResult = await pool.query(
        "SELECT id FROM stig.targets WHERE id = $1",
        [targetId],
      );
      if (targetResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Target not found" },
        };
      }

      // Base query for assigned definitions
      let dataQuery: string;
      if (includeCompliance) {
        // Include compliance info from latest audit for each STIG
        dataQuery = `
          SELECT td.id, td.target_id, td.definition_id, td.is_primary, td.enabled, td.notes,
                 td.created_at, td.updated_at,
                 d.stig_id, d.title as stig_title, d.version as stig_version,
                 (SELECT COUNT(*) FROM stig.definition_rules dr WHERE dr.definition_id = d.id) as rules_count,
                 j.completed_at as last_audit_date,
                 j.status as last_audit_status,
                 CASE WHEN ar_summary.total > 0
                      THEN ROUND((ar_summary.passed::numeric / ar_summary.total) * 100, 1)
                      ELSE NULL END as compliance_score,
                 ar_summary.passed, ar_summary.failed, ar_summary.not_reviewed
          FROM stig.target_definitions td
          JOIN stig.definitions d ON td.definition_id = d.id
          LEFT JOIN LATERAL (
            SELECT id, completed_at, status
            FROM stig.audit_jobs
            WHERE target_id = td.target_id AND definition_id = td.definition_id
            ORDER BY completed_at DESC NULLS LAST
            LIMIT 1
          ) j ON true
          LEFT JOIN LATERAL (
            SELECT
              COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'pass') as passed,
              COUNT(*) FILTER (WHERE status = 'fail') as failed,
              COUNT(*) FILTER (WHERE status = 'not_reviewed') as not_reviewed
            FROM stig.audit_results
            WHERE job_id = j.id
          ) ar_summary ON j.id IS NOT NULL
          WHERE td.target_id = $1
          ORDER BY td.is_primary DESC, d.title
        `;
      } else {
        dataQuery = `
          SELECT td.id, td.target_id, td.definition_id, td.is_primary, td.enabled, td.notes,
                 td.created_at, td.updated_at,
                 d.stig_id, d.title as stig_title, d.version as stig_version,
                 (SELECT COUNT(*) FROM stig.definition_rules dr WHERE dr.definition_id = d.id) as rules_count
          FROM stig.target_definitions td
          JOIN stig.definitions d ON td.definition_id = d.id
          WHERE td.target_id = $1
          ORDER BY td.is_primary DESC, d.title
        `;
      }

      const dataResult = await pool.query(dataQuery, [targetId]);

      const assignments = dataResult.rows.map((row) => {
        const base = {
          id: row.id,
          targetId: row.target_id,
          definitionId: row.definition_id,
          isPrimary: row.is_primary,
          enabled: row.enabled,
          notes: row.notes,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          stigId: row.stig_id,
          stigTitle: row.stig_title,
          stigVersion: row.stig_version,
          rulesCount: parseInt(row.rules_count, 10),
        };

        if (includeCompliance) {
          return {
            ...base,
            lastAuditDate: row.last_audit_date,
            lastAuditStatus: row.last_audit_status,
            complianceScore: row.compliance_score
              ? parseFloat(row.compliance_score)
              : null,
            passed: row.passed ? parseInt(row.passed, 10) : null,
            failed: row.failed ? parseInt(row.failed, 10) : null,
            notReviewed: row.not_reviewed
              ? parseInt(row.not_reviewed, 10)
              : null,
          };
        }
        return base;
      });

      return {
        success: true,
        data: assignments,
      };
    },
  );

  // Assign a single STIG to a target
  fastify.post<{
    Params: { targetId: string };
    Body: z.infer<typeof targetDefinitionCreateSchema>;
  }>(
    "/:targetId/definitions",
    {
      schema: {
        tags: ["STIG - Target Assignments"],
        summary: "Assign a STIG to a target",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            targetId: { type: "string", format: "uuid" },
          },
          required: ["targetId"],
        },
        body: {
          type: "object",
          required: ["definitionId"],
          properties: {
            definitionId: { type: "string", format: "uuid" },
            isPrimary: { type: "boolean" },
            enabled: { type: "boolean" },
            notes: { type: "string" },
          },
        },
      },
      preHandler: [
        fastify.requireAuth,
        fastify.requireRole("admin", "operator"),
      ],
    },
    async (request, reply) => {
      const { targetId } = request.params;
      const body = targetDefinitionCreateSchema.parse(request.body);

      // Verify target exists
      const targetResult = await pool.query(
        "SELECT id FROM stig.targets WHERE id = $1",
        [targetId],
      );
      if (targetResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Target not found" },
        };
      }

      // Verify definition exists
      const defResult = await pool.query(
        "SELECT id FROM stig.definitions WHERE id = $1",
        [body.definitionId],
      );
      if (defResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "STIG definition not found" },
        };
      }

      // Check if already assigned
      const existingResult = await pool.query(
        "SELECT id FROM stig.target_definitions WHERE target_id = $1 AND definition_id = $2",
        [targetId, body.definitionId],
      );
      if (existingResult.rows.length > 0) {
        reply.status(409);
        return {
          success: false,
          error: {
            code: "CONFLICT",
            message: "STIG already assigned to target",
          },
        };
      }

      // Insert assignment
      const result = await pool.query(
        `INSERT INTO stig.target_definitions (target_id, definition_id, is_primary, enabled, notes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, target_id, definition_id, is_primary, enabled, notes, created_at, updated_at`,
        [targetId, body.definitionId, body.isPrimary, body.enabled, body.notes],
      );

      const row = result.rows[0];
      logger.info(
        { targetId, definitionId: body.definitionId },
        "STIG assigned to target",
      );

      reply.status(201);
      return {
        success: true,
        data: {
          id: row.id,
          targetId: row.target_id,
          definitionId: row.definition_id,
          isPrimary: row.is_primary,
          enabled: row.enabled,
          notes: row.notes,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Bulk assign STIGs to a target
  fastify.post<{
    Params: { targetId: string };
    Body: z.infer<typeof bulkAssignmentSchema>;
  }>(
    "/:targetId/definitions/bulk",
    {
      schema: {
        tags: ["STIG - Target Assignments"],
        summary: "Bulk assign multiple STIGs to a target",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            targetId: { type: "string", format: "uuid" },
          },
          required: ["targetId"],
        },
        body: {
          type: "object",
          required: ["definitionIds"],
          properties: {
            definitionIds: {
              type: "array",
              items: { type: "string", format: "uuid" },
              minItems: 1,
            },
            primaryId: { type: "string", format: "uuid" },
          },
        },
      },
      preHandler: [
        fastify.requireAuth,
        fastify.requireRole("admin", "operator"),
      ],
    },
    async (request, reply) => {
      const { targetId } = request.params;
      const body = bulkAssignmentSchema.parse(request.body);

      // Verify target exists
      const targetResult = await pool.query(
        "SELECT id FROM stig.targets WHERE id = $1",
        [targetId],
      );
      if (targetResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Target not found" },
        };
      }

      let assigned = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const definitionId of body.definitionIds) {
        try {
          // Check if definition exists
          const defResult = await pool.query(
            "SELECT id FROM stig.definitions WHERE id = $1",
            [definitionId],
          );
          if (defResult.rows.length === 0) {
            errors.push(`Definition ${definitionId} not found`);
            continue;
          }

          // Try to insert (ON CONFLICT DO NOTHING)
          const isPrimary = body.primaryId === definitionId;
          const insertResult = await pool.query(
            `INSERT INTO stig.target_definitions (target_id, definition_id, is_primary, enabled)
             VALUES ($1, $2, $3, true)
             ON CONFLICT (target_id, definition_id) DO NOTHING
             RETURNING id`,
            [targetId, definitionId, isPrimary],
          );

          if (insertResult.rows.length > 0) {
            assigned++;
          } else {
            skipped++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          errors.push(`Failed to assign ${definitionId}: ${msg}`);
        }
      }

      logger.info(
        { targetId, assigned, skipped, errorCount: errors.length },
        "Bulk STIG assignment completed",
      );

      return {
        success: true,
        data: {
          targetId,
          assigned,
          skipped,
          errors,
        },
      };
    },
  );

  // Update a STIG assignment
  fastify.patch<{
    Params: { targetId: string; assignmentId: string };
    Body: z.infer<typeof targetDefinitionUpdateSchema>;
  }>(
    "/:targetId/definitions/:assignmentId",
    {
      schema: {
        tags: ["STIG - Target Assignments"],
        summary: "Update a STIG assignment",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            targetId: { type: "string", format: "uuid" },
            assignmentId: { type: "string", format: "uuid" },
          },
          required: ["targetId", "assignmentId"],
        },
        body: {
          type: "object",
          properties: {
            isPrimary: { type: "boolean" },
            enabled: { type: "boolean" },
            notes: { type: "string" },
          },
        },
      },
      preHandler: [
        fastify.requireAuth,
        fastify.requireRole("admin", "operator"),
      ],
    },
    async (request, reply) => {
      const { targetId, assignmentId } = request.params;
      const body = targetDefinitionUpdateSchema.parse(request.body);

      // Verify assignment exists and belongs to this target
      const existingResult = await pool.query(
        "SELECT id FROM stig.target_definitions WHERE id = $1 AND target_id = $2",
        [assignmentId, targetId],
      );
      if (existingResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Assignment not found" },
        };
      }

      // Build update query dynamically
      const updates: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (body.isPrimary !== undefined) {
        updates.push(`is_primary = $${paramIndex++}`);
        params.push(body.isPrimary);
      }
      if (body.enabled !== undefined) {
        updates.push(`enabled = $${paramIndex++}`);
        params.push(body.enabled);
      }
      if (body.notes !== undefined) {
        updates.push(`notes = $${paramIndex++}`);
        params.push(body.notes);
      }

      if (updates.length === 0) {
        reply.status(400);
        return {
          success: false,
          error: { code: "BAD_REQUEST", message: "No fields to update" },
        };
      }

      updates.push(`updated_at = NOW()`);
      params.push(assignmentId);

      const result = await pool.query(
        `UPDATE stig.target_definitions
         SET ${updates.join(", ")}
         WHERE id = $${paramIndex}
         RETURNING id, target_id, definition_id, is_primary, enabled, notes, created_at, updated_at`,
        params,
      );

      const row = result.rows[0];
      logger.info({ targetId, assignmentId }, "STIG assignment updated");

      return {
        success: true,
        data: {
          id: row.id,
          targetId: row.target_id,
          definitionId: row.definition_id,
          isPrimary: row.is_primary,
          enabled: row.enabled,
          notes: row.notes,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Remove a STIG assignment
  fastify.delete<{
    Params: { targetId: string; assignmentId: string };
  }>(
    "/:targetId/definitions/:assignmentId",
    {
      schema: {
        tags: ["STIG - Target Assignments"],
        summary: "Remove a STIG from a target",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            targetId: { type: "string", format: "uuid" },
            assignmentId: { type: "string", format: "uuid" },
          },
          required: ["targetId", "assignmentId"],
        },
      },
      preHandler: [
        fastify.requireAuth,
        fastify.requireRole("admin", "operator"),
      ],
    },
    async (request, reply) => {
      const { targetId, assignmentId } = request.params;

      const result = await pool.query(
        "DELETE FROM stig.target_definitions WHERE id = $1 AND target_id = $2 RETURNING id",
        [assignmentId, targetId],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Assignment not found" },
        };
      }

      logger.info({ targetId, assignmentId }, "STIG assignment removed");
      return reply.status(204).send();
    },
  );

  // Audit All - Run audits for all enabled STIGs on a target
  fastify.post<{
    Params: { targetId: string };
    Body: z.infer<typeof auditAllSchema>;
  }>(
    "/:targetId/audit-all",
    {
      schema: {
        tags: ["STIG - Batch Audits"],
        summary: "Run audits for all enabled STIGs on a target",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            targetId: { type: "string", format: "uuid" },
          },
          required: ["targetId"],
        },
        body: {
          type: "object",
          properties: {
            definitionIds: {
              type: "array",
              items: { type: "string", format: "uuid" },
              description:
                "Optional: specific definitions to audit (omit for all enabled)",
            },
            name: {
              type: "string",
              description: "Optional name for the audit group",
            },
          },
        },
      },
      preHandler: [
        fastify.requireAuth,
        fastify.requireRole("admin", "operator"),
      ],
    },
    async (request, reply) => {
      const { targetId } = request.params;
      const body = auditAllSchema.parse(request.body || {});
      const userId = (request as unknown as { user: { id: string } }).user?.id;

      // Verify target exists
      const targetResult = await pool.query(
        "SELECT id, name FROM stig.targets WHERE id = $1",
        [targetId],
      );
      if (targetResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Target not found" },
        };
      }
      const targetName = targetResult.rows[0].name;

      // Get enabled definitions to audit
      let definitionsQuery: string;
      let definitionsParams: (string | string[])[];

      if (body.definitionIds && body.definitionIds.length > 0) {
        // Audit specific definitions (must be assigned and enabled)
        definitionsQuery = `
          SELECT td.definition_id, d.title as stig_title
          FROM stig.target_definitions td
          JOIN stig.definitions d ON td.definition_id = d.id
          WHERE td.target_id = $1 AND td.enabled = true AND td.definition_id = ANY($2)
        `;
        definitionsParams = [targetId, body.definitionIds];
      } else {
        // Audit all enabled definitions
        definitionsQuery = `
          SELECT td.definition_id, d.title as stig_title
          FROM stig.target_definitions td
          JOIN stig.definitions d ON td.definition_id = d.id
          WHERE td.target_id = $1 AND td.enabled = true
        `;
        definitionsParams = [targetId];
      }

      const definitionsResult = await pool.query(
        definitionsQuery,
        definitionsParams,
      );

      if (definitionsResult.rows.length === 0) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "NO_DEFINITIONS",
            message: "No enabled STIG definitions to audit",
          },
        };
      }

      // Create audit group
      const groupName =
        body.name ||
        `Audit All - ${targetName} - ${new Date().toISOString().slice(0, 16)}`;
      const groupResult = await pool.query(
        `INSERT INTO stig.audit_groups (name, target_id, status, total_jobs, created_by)
         VALUES ($1, $2, 'pending', $3, $4)
         RETURNING id, name, target_id, status, total_jobs, completed_jobs, created_at`,
        [groupName, targetId, definitionsResult.rows.length, userId],
      );
      const groupId = groupResult.rows[0].id;

      // Create individual audit jobs (proxy to STIG service)
      const token = getTokenFromRequest(request);
      const jobs: Array<{
        jobId: string;
        definitionId: string;
        stigTitle: string;
      }> = [];
      const jobErrors: string[] = [];

      for (const row of definitionsResult.rows) {
        try {
          const result = await proxyToSTIGService(
            "POST",
            "/api/v1/stig/audits",
            token || "",
            {
              target_id: targetId,
              definition_id: row.definition_id,
              name: `${row.stig_title} - ${targetName}`,
              audit_group_id: groupId,
            },
          );

          if (result.status === 200 || result.status === 201) {
            const jobData = result.data as { data?: { id: string } };
            if (jobData.data?.id) {
              jobs.push({
                jobId: jobData.data.id,
                definitionId: row.definition_id,
                stigTitle: row.stig_title,
              });
            }
          } else {
            jobErrors.push(`Failed to start audit for ${row.stig_title}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          jobErrors.push(`Failed to start audit for ${row.stig_title}: ${msg}`);
        }
      }

      // Update group status to running if jobs were created
      if (jobs.length > 0) {
        await pool.query(
          "UPDATE stig.audit_groups SET status = 'running' WHERE id = $1",
          [groupId],
        );
      } else {
        // Mark as failed if no jobs could be created
        await pool.query(
          "UPDATE stig.audit_groups SET status = 'failed', completed_at = NOW() WHERE id = $1",
          [groupId],
        );
      }

      logger.info(
        {
          targetId,
          groupId,
          jobsCreated: jobs.length,
          errors: jobErrors.length,
        },
        "Audit All initiated",
      );

      reply.status(201);
      return {
        success: true,
        data: {
          groupId,
          groupName,
          targetId,
          targetName,
          totalJobs: definitionsResult.rows.length,
          jobsCreated: jobs.length,
          jobs,
          errors: jobErrors,
        },
      };
    },
  );
};

// =============================================================================
// Audit Group Routes (STIG-13: Multi-STIG Support)
// =============================================================================

const auditGroupRoutes: FastifyPluginAsync = async (fastify) => {
  // Get audit group by ID
  fastify.get<{
    Params: { groupId: string };
  }>(
    "/:groupId",
    {
      schema: {
        tags: ["STIG - Batch Audits"],
        summary: "Get audit group status",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            groupId: { type: "string", format: "uuid" },
          },
          required: ["groupId"],
        },
      },
      preHandler: [fastify.requireAuth],
    },
    async (request, reply) => {
      const { groupId } = request.params;

      const groupResult = await pool.query(
        `SELECT ag.id, ag.name, ag.target_id, ag.status, ag.total_jobs, ag.completed_jobs,
                ag.created_by, ag.created_at, ag.completed_at,
                t.name as target_name
         FROM stig.audit_groups ag
         JOIN stig.targets t ON ag.target_id = t.id
         WHERE ag.id = $1`,
        [groupId],
      );

      if (groupResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Audit group not found" },
        };
      }

      const group = groupResult.rows[0];

      // Get jobs in this group
      const jobsResult = await pool.query(
        `SELECT j.id, j.name, j.status, j.started_at, j.completed_at,
                d.id as definition_id, d.title as stig_title
         FROM stig.audit_jobs j
         JOIN stig.definitions d ON j.definition_id = d.id
         WHERE j.audit_group_id = $1
         ORDER BY d.title`,
        [groupId],
      );

      const progressPercent =
        group.total_jobs > 0
          ? Math.round((group.completed_jobs / group.total_jobs) * 100)
          : 0;

      return {
        success: true,
        data: {
          id: group.id,
          name: group.name,
          targetId: group.target_id,
          targetName: group.target_name,
          status: group.status,
          totalJobs: group.total_jobs,
          completedJobs: group.completed_jobs,
          progressPercent,
          createdBy: group.created_by,
          createdAt: group.created_at,
          completedAt: group.completed_at,
          jobs: jobsResult.rows.map((job) => ({
            id: job.id,
            name: job.name,
            status: job.status,
            startedAt: job.started_at,
            completedAt: job.completed_at,
            definitionId: job.definition_id,
            stigTitle: job.stig_title,
          })),
        },
      };
    },
  );

  // Get aggregated compliance summary for an audit group
  fastify.get<{
    Params: { groupId: string };
  }>(
    "/:groupId/summary",
    {
      schema: {
        tags: ["STIG - Batch Audits"],
        summary: "Get aggregated compliance summary for an audit group",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            groupId: { type: "string", format: "uuid" },
          },
          required: ["groupId"],
        },
      },
      preHandler: [fastify.requireAuth],
    },
    async (request, reply) => {
      const { groupId } = request.params;

      // Get group info
      const groupResult = await pool.query(
        `SELECT ag.id, ag.target_id, ag.status, t.name as target_name
         FROM stig.audit_groups ag
         JOIN stig.targets t ON ag.target_id = t.id
         WHERE ag.id = $1`,
        [groupId],
      );

      if (groupResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Audit group not found" },
        };
      }

      const group = groupResult.rows[0];

      // Get per-STIG summaries
      const stigSummariesResult = await pool.query(
        `SELECT
           j.id as job_id,
           d.id as definition_id,
           d.title as stig_title,
           j.status as job_status,
           COUNT(ar.id) as total_checks,
           COUNT(*) FILTER (WHERE ar.status = 'pass') as passed,
           COUNT(*) FILTER (WHERE ar.status = 'fail') as failed,
           COUNT(*) FILTER (WHERE ar.status = 'not_applicable') as not_applicable,
           COUNT(*) FILTER (WHERE ar.status = 'not_reviewed') as not_reviewed,
           COUNT(*) FILTER (WHERE ar.status = 'error') as errors
         FROM stig.audit_jobs j
         JOIN stig.definitions d ON j.definition_id = d.id
         LEFT JOIN stig.audit_results ar ON j.id = ar.job_id
         WHERE j.audit_group_id = $1
         GROUP BY j.id, d.id, d.title, j.status
         ORDER BY d.title`,
        [groupId],
      );

      // Calculate totals
      let totalChecks = 0;
      let totalPassed = 0;
      let totalFailed = 0;
      let totalNotApplicable = 0;
      let totalNotReviewed = 0;
      let totalErrors = 0;

      const stigSummaries = stigSummariesResult.rows.map((row) => {
        const checks = parseInt(row.total_checks, 10) || 0;
        const passed = parseInt(row.passed, 10) || 0;
        const failed = parseInt(row.failed, 10) || 0;
        const notApplicable = parseInt(row.not_applicable, 10) || 0;
        const notReviewed = parseInt(row.not_reviewed, 10) || 0;
        const errors = parseInt(row.errors, 10) || 0;

        totalChecks += checks;
        totalPassed += passed;
        totalFailed += failed;
        totalNotApplicable += notApplicable;
        totalNotReviewed += notReviewed;
        totalErrors += errors;

        const complianceScore =
          checks > 0 ? Math.round((passed / checks) * 100 * 10) / 10 : 0;

        return {
          jobId: row.job_id,
          definitionId: row.definition_id,
          stigTitle: row.stig_title,
          jobStatus: row.job_status,
          totalChecks: checks,
          passed,
          failed,
          notApplicable,
          notReviewed,
          errors,
          complianceScore,
        };
      });

      const overallComplianceScore =
        totalChecks > 0
          ? Math.round((totalPassed / totalChecks) * 100 * 10) / 10
          : 0;

      return {
        success: true,
        data: {
          groupId: group.id,
          targetId: group.target_id,
          targetName: group.target_name,
          status: group.status,
          totalChecks,
          passed: totalPassed,
          failed: totalFailed,
          notApplicable: totalNotApplicable,
          notReviewed: totalNotReviewed,
          errors: totalErrors,
          complianceScore: overallComplianceScore,
          totalStigs: stigSummaries.length,
          stigSummaries,
        },
      };
    },
  );

  // List audit groups for a target
  fastify.get<{
    Querystring: { targetId?: string; page?: number; limit?: number };
  }>(
    "/",
    {
      schema: {
        tags: ["STIG - Batch Audits"],
        summary: "List audit groups",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            targetId: { type: "string", format: "uuid" },
            page: { type: "number", minimum: 1, default: 1 },
            limit: { type: "number", minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
      preHandler: [fastify.requireAuth],
    },
    async (request, reply) => {
      const query = querySchema.parse(request.query);
      const { targetId } = request.query as { targetId?: string };
      const offset = (query.page - 1) * query.limit;

      const whereClause = targetId ? "WHERE ag.target_id = $3" : "";
      const params = targetId
        ? [query.limit, offset, targetId]
        : [query.limit, offset];

      const countParams = targetId ? [targetId] : [];
      const countQuery = `SELECT COUNT(*) FROM stig.audit_groups ag ${whereClause}`;

      const dataQuery = `
        SELECT ag.id, ag.name, ag.target_id, ag.status, ag.total_jobs, ag.completed_jobs,
               ag.created_at, ag.completed_at, t.name as target_name
        FROM stig.audit_groups ag
        JOIN stig.targets t ON ag.target_id = t.id
        ${whereClause}
        ORDER BY ag.created_at DESC
        LIMIT $1 OFFSET $2
      `;

      const [countResult, dataResult] = await Promise.all([
        pool.query(countQuery, countParams),
        pool.query(dataQuery, params),
      ]);

      return {
        success: true,
        data: dataResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          targetId: row.target_id,
          targetName: row.target_name,
          status: row.status,
          totalJobs: row.total_jobs,
          completedJobs: row.completed_jobs,
          progressPercent:
            row.total_jobs > 0
              ? Math.round((row.completed_jobs / row.total_jobs) * 100)
              : 0,
          createdAt: row.created_at,
          completedAt: row.completed_at,
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

  // Download combined PDF report for an audit group
  fastify.get<{
    Params: { groupId: string };
  }>(
    "/:groupId/report/pdf",
    {
      schema: {
        tags: ["STIG - Batch Audits"],
        summary: "Download combined PDF report for an audit group",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            groupId: { type: "string", format: "uuid" },
          },
          required: ["groupId"],
        },
      },
      preHandler: [fastify.requireAuth],
    },
    async (request, reply) => {
      const { groupId } = request.params;
      const token = request.headers.authorization?.replace("Bearer ", "") || "";

      try {
        const { config } = await import("../../config");
        const url = `${config.STIG_SERVICE_URL}/api/v1/stig/audit-groups/${groupId}/report/pdf`;

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const error = await response.json();
          reply.status(response.status);
          return { success: false, error };
        }

        // Stream the file response
        const contentType =
          response.headers.get("content-type") || "application/pdf";
        const contentDisposition =
          response.headers.get("content-disposition") ||
          `attachment; filename="combined_report.pdf"`;

        reply.header("Content-Type", contentType);
        reply.header("Content-Disposition", contentDisposition);

        return reply.send(response.body);
      } catch (error) {
        reply.status(500);
        return {
          success: false,
          error: { code: "PROXY_ERROR", message: "Failed to download report" },
        };
      }
    },
  );

  // Download combined CKL ZIP for an audit group
  fastify.get<{
    Params: { groupId: string };
  }>(
    "/:groupId/report/ckl",
    {
      schema: {
        tags: ["STIG - Batch Audits"],
        summary: "Download CKL checklists ZIP for an audit group",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            groupId: { type: "string", format: "uuid" },
          },
          required: ["groupId"],
        },
      },
      preHandler: [fastify.requireAuth],
    },
    async (request, reply) => {
      const { groupId } = request.params;
      const token = request.headers.authorization?.replace("Bearer ", "") || "";

      try {
        const { config } = await import("../../config");
        const url = `${config.STIG_SERVICE_URL}/api/v1/stig/audit-groups/${groupId}/report/ckl`;

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const error = await response.json();
          reply.status(response.status);
          return { success: false, error };
        }

        // Stream the file response
        const contentType =
          response.headers.get("content-type") || "application/zip";
        const contentDisposition =
          response.headers.get("content-disposition") ||
          `attachment; filename="checklists.zip"`;

        reply.header("Content-Type", contentType);
        reply.header("Content-Disposition", contentDisposition);

        return reply.send(response.body);
      } catch (error) {
        reply.status(500);
        return {
          success: false,
          error: {
            code: "PROXY_ERROR",
            message: "Failed to download checklists",
          },
        };
      }
    },
  );
};

// =============================================================================
// Audit Routes (Proxy to STIG Service)
// =============================================================================

const auditJobSchema = z.object({
  targetId: z.string().uuid(),
  definitionId: z.string().uuid().optional(),
  name: z.string().max(255).optional(),
});

async function proxyToSTIGService(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const { config } = await import("../../config");

  const url = `${config.STIG_SERVICE_URL}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };

  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  return { status: response.status, data };
}

// Helper to extract token from request
function getTokenFromRequest(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    return auth.substring(7);
  }
  return null;
}

// =============================================================================
// Target Configuration Analysis Routes (Proxy to STIG Service)
// =============================================================================

const targetRoutes: FastifyPluginAsync = async (fastify) => {
  // Analyze target configuration file
  fastify.post(
    "/:targetId/analyze-config",
    {
      schema: {
        tags: ["STIG - Configuration Analysis"],
        summary: "Analyze configuration file against STIG",
        security: [{ bearerAuth: [] }],
        consumes: ["multipart/form-data"],
        params: {
          type: "object",
          properties: {
            targetId: { type: "string", format: "uuid" },
          },
          required: ["targetId"],
        },
      },
      preHandler: [
        fastify.requireAuth,
        fastify.requireRole("admin", "operator"),
      ],
    },
    async (request, reply) => {
      const token = getTokenFromRequest(request);
      if (!token) {
        reply.status(401);
        return {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Missing token" },
        };
      }

      const { targetId } = request.params as { targetId: string };

      try {
        // Get multipart data from request
        const data = await request.file();
        if (!data) {
          reply.status(400);
          return {
            success: false,
            error: {
              code: "NO_FILE",
              message: "No configuration file uploaded",
            },
          };
        }

        // Read file content
        const chunks: Buffer[] = [];
        for await (const chunk of data.file) {
          chunks.push(chunk as Buffer);
        }
        const fileBuffer = Buffer.concat(chunks);

        // Get definition_id from form fields
        const fields = data.fields as Record<string, { value: string }>;
        const definitionId = fields.definition_id?.value;

        if (!definitionId) {
          reply.status(400);
          return {
            success: false,
            error: {
              code: "MISSING_FIELD",
              message: "definition_id is required",
            },
          };
        }

        // Forward to STIG service as multipart form
        const { config } = await import("../../config");
        const url = `${config.STIG_SERVICE_URL}/api/v1/stig/targets/${targetId}/analyze-config`;

        // Create FormData for the forwarded request
        const FormData = (await import("form-data")).default;
        const form = new FormData();
        form.append("config_file", fileBuffer, {
          filename: data.filename,
          contentType: data.mimetype,
        });
        form.append("definition_id", definitionId);

        // Convert form-data to buffer for native fetch compatibility
        const formBuffer = form.getBuffer();
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            ...form.getHeaders(),
          },
          body: new Uint8Array(formBuffer),
        });

        const responseData = await response.json();
        reply.status(response.status);
        return responseData;
      } catch (err) {
        logger.error(
          { err },
          "Failed to proxy config analysis to STIG service",
        );
        reply.status(502);
        return {
          success: false,
          error: { code: "BAD_GATEWAY", message: "STIG service unavailable" },
        };
      }
    },
  );
};

// Register audit routes in the stigRoutes function
const auditRoutes: FastifyPluginAsync = async (fastify) => {
  // List audit jobs
  fastify.get(
    "/",
    {
      schema: {
        tags: ["STIG - Audits"],
        summary: "List audit jobs",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            page: { type: "number", minimum: 1, default: 1 },
            limit: { type: "number", minimum: 1, maximum: 100, default: 20 },
            targetId: { type: "string", format: "uuid" },
            status: { type: "string" },
          },
        },
      },
      preHandler: [fastify.requireAuth],
    },
    async (request, reply) => {
      const token = getTokenFromRequest(request);
      if (!token) {
        reply.status(401);
        return {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Missing token" },
        };
      }

      const query = request.query as Record<string, string | number>;
      const params = new URLSearchParams();
      if (query.page) params.append("page", String(query.page));
      if (query.limit) params.append("per_page", String(query.limit));
      if (query.targetId) params.append("target_id", String(query.targetId));
      if (query.status) params.append("status", String(query.status));

      try {
        const result = await proxyToSTIGService(
          "GET",
          `/api/v1/stig/audits?${params.toString()}`,
          token,
        );
        reply.status(result.status);
        return result.data;
      } catch (err) {
        logger.error({ err }, "Failed to proxy to STIG service");
        reply.status(502);
        return {
          success: false,
          error: { code: "BAD_GATEWAY", message: "STIG service unavailable" },
        };
      }
    },
  );

  // Start a new audit
  fastify.post(
    "/",
    {
      schema: {
        tags: ["STIG - Audits"],
        summary: "Start a new STIG audit",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["targetId"],
          properties: {
            targetId: { type: "string", format: "uuid" },
            definitionId: { type: "string", format: "uuid" },
            name: { type: "string" },
          },
        },
      },
      preHandler: [
        fastify.requireAuth,
        fastify.requireRole("admin", "operator"),
      ],
    },
    async (request, reply) => {
      const token = getTokenFromRequest(request);
      if (!token) {
        reply.status(401);
        return {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Missing token" },
        };
      }

      const body = auditJobSchema.parse(request.body);

      // Convert camelCase to snake_case for Python service
      const pythonBody = {
        target_id: body.targetId,
        definition_id: body.definitionId,
        name: body.name,
      };

      try {
        const result = await proxyToSTIGService(
          "POST",
          "/api/v1/stig/audits",
          token,
          pythonBody,
        );
        reply.status(result.status);
        return result.data;
      } catch (err) {
        logger.error({ err }, "Failed to proxy audit request to STIG service");
        reply.status(502);
        return {
          success: false,
          error: { code: "BAD_GATEWAY", message: "STIG service unavailable" },
        };
      }
    },
  );

  // Get a specific audit job
  fastify.get(
    "/:jobId",
    {
      schema: {
        tags: ["STIG - Audits"],
        summary: "Get audit job by ID",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            jobId: { type: "string", format: "uuid" },
          },
          required: ["jobId"],
        },
      },
      preHandler: [fastify.requireAuth],
    },
    async (request, reply) => {
      const token = getTokenFromRequest(request);
      if (!token) {
        reply.status(401);
        return {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Missing token" },
        };
      }

      const { jobId } = request.params as { jobId: string };

      try {
        const result = await proxyToSTIGService(
          "GET",
          `/api/v1/stig/audits/${jobId}`,
          token,
        );
        reply.status(result.status);
        return result.data;
      } catch (err) {
        logger.error({ err }, "Failed to proxy to STIG service");
        reply.status(502);
        return {
          success: false,
          error: { code: "BAD_GATEWAY", message: "STIG service unavailable" },
        };
      }
    },
  );

  // Cancel an audit
  fastify.post(
    "/:jobId/cancel",
    {
      schema: {
        tags: ["STIG - Audits"],
        summary: "Cancel a running audit",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            jobId: { type: "string", format: "uuid" },
          },
          required: ["jobId"],
        },
      },
      preHandler: [
        fastify.requireAuth,
        fastify.requireRole("admin", "operator"),
      ],
    },
    async (request, reply) => {
      const token = getTokenFromRequest(request);
      if (!token) {
        reply.status(401);
        return {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Missing token" },
        };
      }

      const { jobId } = request.params as { jobId: string };

      try {
        const result = await proxyToSTIGService(
          "POST",
          `/api/v1/stig/audits/${jobId}/cancel`,
          token,
        );
        reply.status(result.status);
        return result.data;
      } catch (err) {
        logger.error({ err }, "Failed to proxy to STIG service");
        reply.status(502);
        return {
          success: false,
          error: { code: "BAD_GATEWAY", message: "STIG service unavailable" },
        };
      }
    },
  );

  // Get audit results
  fastify.get(
    "/:jobId/results",
    {
      schema: {
        tags: ["STIG - Audits"],
        summary: "Get results for an audit job",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            jobId: { type: "string", format: "uuid" },
          },
          required: ["jobId"],
        },
        querystring: {
          type: "object",
          properties: {
            page: { type: "number", minimum: 1, default: 1 },
            limit: { type: "number", minimum: 1, maximum: 100, default: 50 },
            status: { type: "string" },
            severity: { type: "string" },
          },
        },
      },
      preHandler: [fastify.requireAuth],
    },
    async (request, reply) => {
      const token = getTokenFromRequest(request);
      if (!token) {
        reply.status(401);
        return {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Missing token" },
        };
      }

      const { jobId } = request.params as { jobId: string };
      const query = request.query as Record<string, string | number>;

      const params = new URLSearchParams();
      if (query.page) params.append("page", String(query.page));
      if (query.limit) params.append("per_page", String(query.limit));
      if (query.status) params.append("status", String(query.status));
      if (query.severity) params.append("severity", String(query.severity));

      try {
        const result = await proxyToSTIGService(
          "GET",
          `/api/v1/stig/audits/${jobId}/results?${params.toString()}`,
          token,
        );
        reply.status(result.status);
        return result.data;
      } catch (err) {
        logger.error({ err }, "Failed to proxy to STIG service");
        reply.status(502);
        return {
          success: false,
          error: { code: "BAD_GATEWAY", message: "STIG service unavailable" },
        };
      }
    },
  );

  // Get audit summary
  fastify.get(
    "/:jobId/summary",
    {
      schema: {
        tags: ["STIG - Audits"],
        summary: "Get compliance summary for an audit",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            jobId: { type: "string", format: "uuid" },
          },
          required: ["jobId"],
        },
      },
      preHandler: [fastify.requireAuth],
    },
    async (request, reply) => {
      const token = getTokenFromRequest(request);
      if (!token) {
        reply.status(401);
        return {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Missing token" },
        };
      }

      const { jobId } = request.params as { jobId: string };

      try {
        const result = await proxyToSTIGService(
          "GET",
          `/api/v1/stig/audits/${jobId}/summary`,
          token,
        );
        reply.status(result.status);
        return result.data;
      } catch (err) {
        logger.error({ err }, "Failed to proxy to STIG service");
        reply.status(502);
        return {
          success: false,
          error: { code: "BAD_GATEWAY", message: "STIG service unavailable" },
        };
      }
    },
  );
};

// Helper function to map CKL status values
function mapCKLStatus(status: string): string {
  const statusMap: Record<string, string> = {
    NotAFinding: "pass",
    Not_Applicable: "not_applicable",
    Open: "fail",
    Not_Reviewed: "not_reviewed",
    pass: "pass",
    fail: "fail",
    not_applicable: "not_applicable",
    not_reviewed: "not_reviewed",
  };
  return statusMap[status] || "not_reviewed";
}

// Helper function to map CKL severity values
function mapCKLSeverity(severity: string): string {
  const severityLower = severity.toLowerCase();
  const severityMap: Record<string, string> = {
    high: "high",
    medium: "medium",
    low: "low",
    "cat i": "high",
    "cat ii": "medium",
    "cat iii": "low",
  };
  return severityMap[severityLower] || "medium";
}

export default stigRoutes;
