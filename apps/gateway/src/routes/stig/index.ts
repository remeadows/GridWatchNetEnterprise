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

// Zod schemas
const targetSchema = z.object({
  name: z.string().min(1).max(255),
  ipAddress: z.string().ip(),
  platform: z.string().max(100),
  osVersion: z.string().max(100).optional(),
  connectionType: z.enum(["ssh", "netmiko", "winrm", "api"]),
  credentialId: z.string().max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  isActive: z.boolean().default(true),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

const stigRoutes: FastifyPluginAsync = async (fastify) => {
  // Require authentication for all STIG routes
  fastify.addHook("preHandler", fastify.requireAuth);

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
      SELECT id, name, ip_address, platform, os_version, connection_type, port, is_active, last_audit, created_at, updated_at
      FROM stig.targets
      ${searchCondition}
      ORDER BY name
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
        `INSERT INTO stig.targets (name, ip_address, platform, os_version, connection_type, credential_id, port, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, ip_address, platform, os_version, connection_type, port, is_active, created_at, updated_at`,
        [
          body.name,
          body.ipAddress,
          body.platform,
          body.osVersion,
          body.connectionType,
          body.credentialId,
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
          port: row.port,
          isActive: row.is_active,
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
             SET title = $1, version = $2, platform = $3, description = $4,
                 xccdf_content = $5, updated_at = NOW()
             WHERE id = $6`,
            [title, version, platform, description, xccdfContent, definitionId],
          );

          // Delete existing rules and re-insert
          await pool.query(
            "DELETE FROM stig.definition_rules WHERE definition_id = $1",
            [definitionId],
          );
        } else {
          // Insert new definition
          const insertResult = await pool.query(
            `INSERT INTO stig.definitions (stig_id, title, version, platform, description, xccdf_content)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [stigId, title, version, platform, description, xccdfContent],
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
