/**
 * NetNynja Enterprise - STIG Manager API Routes
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db';
import { logger } from '../../logger';

// Zod schemas
const assetSchema = z.object({
  hostname: z.string().min(1).max(255),
  ipAddress: z.string().ip().optional(),
  assetType: z.enum(['workstation', 'server', 'network_device', 'database', 'application', 'other']),
  operatingSystem: z.string().max(100).optional(),
  fqdn: z.string().max(255).optional(),
  macAddress: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/).optional(),
  notes: z.string().optional(),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

const stigRoutes: FastifyPluginAsync = async (fastify) => {
  // Require authentication for all STIG routes
  fastify.addHook('preHandler', fastify.requireAuth);

  // List STIG benchmarks
  fastify.get('/benchmarks', {
    schema: {
      tags: ['STIG - Benchmarks'],
      summary: 'List available STIG benchmarks',
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

    const countQuery = `SELECT COUNT(*) FROM stig.benchmarks ${searchCondition}`;
    const dataQuery = `
      SELECT id, stig_id, title, version, release_date, description, created_at, updated_at
      FROM stig.benchmarks
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

  // Get benchmark by ID
  fastify.get('/benchmarks/:id', {
    schema: {
      tags: ['STIG - Benchmarks'],
      summary: 'Get STIG benchmark by ID',
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
      `SELECT id, stig_id, title, version, release_date, description, created_at, updated_at
       FROM stig.benchmarks WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { success: false, error: { code: 'NOT_FOUND', message: 'Benchmark not found' } };
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
        description: row.description,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  });

  // List assets
  fastify.get('/assets', {
    schema: {
      tags: ['STIG - Assets'],
      summary: 'List assets',
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
      ? `WHERE hostname ILIKE $3 OR ip_address::text ILIKE $3`
      : '';
    const searchParam = query.search ? `%${query.search}%` : null;

    const countQuery = `SELECT COUNT(*) FROM stig.assets ${searchCondition}`;
    const dataQuery = `
      SELECT id, hostname, ip_address, asset_type, operating_system, fqdn, created_at, updated_at
      FROM stig.assets
      ${searchCondition}
      ORDER BY hostname
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
        hostname: row.hostname,
        ipAddress: row.ip_address,
        assetType: row.asset_type,
        operatingSystem: row.operating_system,
        fqdn: row.fqdn,
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

  // Create asset
  fastify.post('/assets', {
    schema: {
      tags: ['STIG - Assets'],
      summary: 'Create a new asset',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['hostname', 'assetType'],
        properties: {
          hostname: { type: 'string' },
          ipAddress: { type: 'string' },
          assetType: { type: 'string', enum: ['workstation', 'server', 'network_device', 'database', 'application', 'other'] },
          operatingSystem: { type: 'string' },
          fqdn: { type: 'string' },
          macAddress: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
    preHandler: [fastify.requireRole('admin', 'operator')],
  }, async (request, reply) => {
    const body = assetSchema.parse(request.body);

    const result = await pool.query(
      `INSERT INTO stig.assets (hostname, ip_address, asset_type, operating_system, fqdn, mac_address, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, hostname, ip_address, asset_type, operating_system, fqdn, created_at, updated_at`,
      [body.hostname, body.ipAddress, body.assetType, body.operatingSystem, body.fqdn, body.macAddress, body.notes]
    );

    const row = result.rows[0];
    reply.status(201);
    return {
      success: true,
      data: {
        id: row.id,
        hostname: row.hostname,
        ipAddress: row.ip_address,
        assetType: row.asset_type,
        operatingSystem: row.operating_system,
        fqdn: row.fqdn,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  });

  // Delete asset
  fastify.delete('/assets/:id', {
    schema: {
      tags: ['STIG - Assets'],
      summary: 'Delete an asset',
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
      'DELETE FROM stig.assets WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { success: false, error: { code: 'NOT_FOUND', message: 'Asset not found' } };
    }

    reply.status(204).send();
  });

  // Get compliance findings for an asset
  fastify.get('/assets/:id/findings', {
    schema: {
      tags: ['STIG - Compliance'],
      summary: 'Get compliance findings for an asset',
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
          status: { type: 'string', enum: ['open', 'not_a_finding', 'not_applicable', 'not_reviewed'] },
          severity: { type: 'string', enum: ['CAT I', 'CAT II', 'CAT III'] },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = querySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const result = await pool.query(
      `SELECT f.id, f.rule_id, r.rule_title, r.severity, f.status, f.finding_details,
              f.comments, f.reviewed_by, f.reviewed_at, f.created_at, f.updated_at
       FROM stig.findings f
       JOIN stig.rules r ON f.rule_id = r.id
       WHERE f.asset_id = $1
       ORDER BY r.severity, r.rule_id
       LIMIT $2 OFFSET $3`,
      [id, query.limit, offset]
    );

    return {
      success: true,
      data: result.rows.map((row) => ({
        id: row.id,
        ruleId: row.rule_id,
        ruleTitle: row.rule_title,
        severity: row.severity,
        status: row.status,
        findingDetails: row.finding_details,
        comments: row.comments,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
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
        COUNT(DISTINCT a.id) as total_assets,
        COUNT(f.id) as total_findings,
        COUNT(CASE WHEN f.status = 'open' THEN 1 END) as open_findings,
        COUNT(CASE WHEN f.status = 'not_a_finding' THEN 1 END) as compliant_findings,
        COUNT(CASE WHEN f.status = 'not_applicable' THEN 1 END) as not_applicable,
        COUNT(CASE WHEN f.status = 'not_reviewed' THEN 1 END) as not_reviewed,
        COUNT(CASE WHEN r.severity = 'CAT I' AND f.status = 'open' THEN 1 END) as cat1_open,
        COUNT(CASE WHEN r.severity = 'CAT II' AND f.status = 'open' THEN 1 END) as cat2_open,
        COUNT(CASE WHEN r.severity = 'CAT III' AND f.status = 'open' THEN 1 END) as cat3_open
      FROM stig.assets a
      LEFT JOIN stig.findings f ON a.id = f.asset_id
      LEFT JOIN stig.rules r ON f.rule_id = r.id
    `);

    const row = result.rows[0];
    const totalFindings = parseInt(row.total_findings, 10) || 1;
    const compliantFindings = parseInt(row.compliant_findings, 10);
    const complianceScore = totalFindings > 0
      ? Math.round((compliantFindings / totalFindings) * 100)
      : 0;

    return {
      success: true,
      data: {
        totalAssets: parseInt(row.total_assets, 10),
        totalFindings: totalFindings,
        openFindings: parseInt(row.open_findings, 10),
        compliantFindings: compliantFindings,
        notApplicable: parseInt(row.not_applicable, 10),
        notReviewed: parseInt(row.not_reviewed, 10),
        complianceScore,
        bySeverity: {
          catI: { open: parseInt(row.cat1_open, 10) },
          catII: { open: parseInt(row.cat2_open, 10) },
          catIII: { open: parseInt(row.cat3_open, 10) },
        },
      },
    };
  });
};

export default stigRoutes;
