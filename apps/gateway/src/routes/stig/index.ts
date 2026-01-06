/**
 * NetNynja Enterprise - STIG Manager API Routes
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db';
import { logger } from '../../logger';

// Zod schemas
const targetSchema = z.object({
  name: z.string().min(1).max(255),
  ipAddress: z.string().ip(),
  platform: z.string().max(100),
  osVersion: z.string().max(100).optional(),
  connectionType: z.enum(['ssh', 'netmiko', 'winrm', 'api']),
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
  fastify.addHook('preHandler', fastify.requireAuth);

  // List STIG definitions (benchmarks)
  fastify.get('/benchmarks', {
    schema: {
      tags: ['STIG - Benchmarks'],
      summary: 'List available STIG definitions',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          search: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const query = querySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const searchCondition = query.search
      ? `WHERE title ILIKE $3 OR stig_id ILIKE $3`
      : '';
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
        pages: Math.ceil(parseInt(countResult.rows[0].count, 10) / query.limit),
      },
    };
  });

  // Get definition by ID
  fastify.get('/benchmarks/:id', {
    schema: {
      tags: ['STIG - Benchmarks'],
      summary: 'Get STIG definition by ID',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const result = await pool.query(
      `SELECT id, stig_id, title, version, release_date, platform, description, created_at, updated_at
       FROM stig.definitions WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { success: false, error: { code: 'NOT_FOUND', message: 'Definition not found' } };
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
  });

  // List targets (assets)
  fastify.get('/assets', {
    schema: {
      tags: ['STIG - Assets'],
      summary: 'List audit targets',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          search: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const query = querySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const searchCondition = query.search
      ? `WHERE name ILIKE $3 OR ip_address::text ILIKE $3`
      : '';
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
        pages: Math.ceil(parseInt(countResult.rows[0].count, 10) / query.limit),
      },
    };
  });

  // Create target
  fastify.post('/assets', {
    schema: {
      tags: ['STIG - Assets'],
      summary: 'Create a new audit target',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'ipAddress', 'platform', 'connectionType'],
        properties: {
          name: { type: 'string' },
          ipAddress: { type: 'string' },
          platform: { type: 'string' },
          osVersion: { type: 'string' },
          connectionType: { type: 'string', enum: ['ssh', 'netmiko', 'winrm', 'api'] },
          credentialId: { type: 'string' },
          port: { type: 'number' },
          isActive: { type: 'boolean' },
        },
      },
    },
    preHandler: [fastify.requireRole('admin', 'operator')],
  }, async (request, reply) => {
    const body = targetSchema.parse(request.body);

    const result = await pool.query(
      `INSERT INTO stig.targets (name, ip_address, platform, os_version, connection_type, credential_id, port, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, ip_address, platform, os_version, connection_type, port, is_active, created_at, updated_at`,
      [body.name, body.ipAddress, body.platform, body.osVersion, body.connectionType, body.credentialId, body.port, body.isActive]
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
  });

  // Delete target
  fastify.delete('/assets/:id', {
    schema: {
      tags: ['STIG - Assets'],
      summary: 'Delete an audit target',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
    preHandler: [fastify.requireRole('admin')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const result = await pool.query(
      'DELETE FROM stig.targets WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { success: false, error: { code: 'NOT_FOUND', message: 'Target not found' } };
    }

    reply.status(204).send();
  });

  // Get audit results for a target
  fastify.get('/assets/:id/findings', {
    schema: {
      tags: ['STIG - Compliance'],
      summary: 'Get audit results for a target',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pass', 'fail', 'not_applicable', 'not_reviewed', 'error'] },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  }, async (request, reply) => {
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
      [id, query.limit, offset]
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
  });

  // Get compliance summary
  fastify.get('/compliance/summary', {
    schema: {
      tags: ['STIG - Compliance'],
      summary: 'Get overall compliance summary',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
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
    const complianceScore = totalResults > 0
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
  });
};

export default stigRoutes;
