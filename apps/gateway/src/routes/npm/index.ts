/**
 * NetNynja Enterprise - NPM (Network Performance Monitoring) API Routes
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db';
import { logger } from '../../logger';

// Zod schemas
const deviceSchema = z.object({
  hostname: z.string().min(1).max(255),
  ipAddress: z.string().ip(),
  deviceType: z.enum(['router', 'switch', 'firewall', 'server', 'access_point', 'other']),
  vendor: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  snmpCommunity: z.string().optional(),
  snmpVersion: z.enum(['v1', 'v2c', 'v3']).default('v2c'),
  pollingInterval: z.number().int().min(30).max(3600).default(300),
  enabled: z.boolean().default(true),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['up', 'down', 'unknown']).optional(),
});

const metricsQuerySchema = z.object({
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  metricType: z.enum(['cpu', 'memory', 'bandwidth', 'latency', 'packet_loss']).optional(),
});

const npmRoutes: FastifyPluginAsync = async (fastify) => {
  // Require authentication for all NPM routes
  fastify.addHook('preHandler', fastify.requireAuth);

  // List monitored devices
  fastify.get('/devices', {
    schema: {
      tags: ['NPM - Devices'],
      summary: 'List monitored devices',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          search: { type: 'string' },
          status: { type: 'string', enum: ['up', 'down', 'unknown'] },
        },
      },
    },
  }, async (request, reply) => {
    const query = querySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const conditions: string[] = [];
    const params: unknown[] = [query.limit, offset];
    let paramIndex = 3;

    if (query.search) {
      conditions.push(`(hostname ILIKE $${paramIndex} OR ip_address::text ILIKE $${paramIndex})`);
      params.push(`%${query.search}%`);
      paramIndex++;
    }
    if (query.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(query.status);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) FROM npm.devices ${whereClause}`;
    const dataQuery = `
      SELECT id, hostname, ip_address, device_type, vendor, model, status,
             last_poll_at, polling_interval, enabled, created_at, updated_at
      FROM npm.devices
      ${whereClause}
      ORDER BY hostname
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
        hostname: row.hostname,
        ipAddress: row.ip_address,
        deviceType: row.device_type,
        vendor: row.vendor,
        model: row.model,
        status: row.status,
        lastPollAt: row.last_poll_at,
        pollingInterval: row.polling_interval,
        enabled: row.enabled,
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

  // Get device by ID
  fastify.get('/devices/:id', {
    schema: {
      tags: ['NPM - Devices'],
      summary: 'Get device by ID',
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
      `SELECT id, hostname, ip_address, device_type, vendor, model, status,
              snmp_version, polling_interval, enabled, last_poll_at, created_at, updated_at
       FROM npm.devices WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } };
    }

    const row = result.rows[0];
    return {
      success: true,
      data: {
        id: row.id,
        hostname: row.hostname,
        ipAddress: row.ip_address,
        deviceType: row.device_type,
        vendor: row.vendor,
        model: row.model,
        status: row.status,
        snmpVersion: row.snmp_version,
        pollingInterval: row.polling_interval,
        enabled: row.enabled,
        lastPollAt: row.last_poll_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  });

  // Create device
  fastify.post('/devices', {
    schema: {
      tags: ['NPM - Devices'],
      summary: 'Add a new device to monitoring',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['hostname', 'ipAddress', 'deviceType'],
        properties: {
          hostname: { type: 'string' },
          ipAddress: { type: 'string' },
          deviceType: { type: 'string', enum: ['router', 'switch', 'firewall', 'server', 'access_point', 'other'] },
          vendor: { type: 'string' },
          model: { type: 'string' },
          snmpCommunity: { type: 'string' },
          snmpVersion: { type: 'string', enum: ['v1', 'v2c', 'v3'] },
          pollingInterval: { type: 'number' },
          enabled: { type: 'boolean' },
        },
      },
    },
    preHandler: [fastify.requireRole('admin', 'operator')],
  }, async (request, reply) => {
    const body = deviceSchema.parse(request.body);

    const result = await pool.query(
      `INSERT INTO npm.devices (hostname, ip_address, device_type, vendor, model, snmp_community, snmp_version, polling_interval, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, hostname, ip_address, device_type, vendor, model, status, polling_interval, enabled, created_at, updated_at`,
      [body.hostname, body.ipAddress, body.deviceType, body.vendor, body.model, body.snmpCommunity, body.snmpVersion, body.pollingInterval, body.enabled]
    );

    const row = result.rows[0];
    reply.status(201);
    return {
      success: true,
      data: {
        id: row.id,
        hostname: row.hostname,
        ipAddress: row.ip_address,
        deviceType: row.device_type,
        vendor: row.vendor,
        model: row.model,
        status: row.status,
        pollingInterval: row.polling_interval,
        enabled: row.enabled,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  });

  // Delete device
  fastify.delete('/devices/:id', {
    schema: {
      tags: ['NPM - Devices'],
      summary: 'Remove device from monitoring',
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
      'DELETE FROM npm.devices WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } };
    }

    reply.status(204).send();
  });

  // Get device metrics
  fastify.get('/devices/:id/metrics', {
    schema: {
      tags: ['NPM - Metrics'],
      summary: 'Get metrics for a device',
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
          startTime: { type: 'string', format: 'date-time' },
          endTime: { type: 'string', format: 'date-time' },
          metricType: { type: 'string', enum: ['cpu', 'memory', 'bandwidth', 'latency', 'packet_loss'] },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = metricsQuerySchema.parse(request.query);

    // Default to last hour
    const endTime = query.endTime || new Date();
    const startTime = query.startTime || new Date(endTime.getTime() - 3600000);

    const conditions = ['device_id = $1', 'collected_at >= $2', 'collected_at <= $3'];
    const params: unknown[] = [id, startTime, endTime];

    if (query.metricType) {
      conditions.push('metric_type = $4');
      params.push(query.metricType);
    }

    const result = await pool.query(
      `SELECT metric_type, metric_value, collected_at
       FROM npm.metrics
       WHERE ${conditions.join(' AND ')}
       ORDER BY collected_at DESC
       LIMIT 1000`,
      params
    );

    return {
      success: true,
      data: {
        deviceId: id,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        metrics: result.rows.map((row) => ({
          type: row.metric_type,
          value: row.metric_value,
          collectedAt: row.collected_at,
        })),
      },
    };
  });

  // List alerts
  fastify.get('/alerts', {
    schema: {
      tags: ['NPM - Alerts'],
      summary: 'List active alerts',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          severity: { type: 'string', enum: ['critical', 'warning', 'info'] },
          acknowledged: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const query = querySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const result = await pool.query(
      `SELECT a.id, a.device_id, d.hostname, a.alert_type, a.severity, a.message,
              a.acknowledged, a.acknowledged_by, a.acknowledged_at, a.created_at
       FROM npm.alerts a
       LEFT JOIN npm.devices d ON a.device_id = d.id
       WHERE a.resolved_at IS NULL
       ORDER BY a.severity DESC, a.created_at DESC
       LIMIT $1 OFFSET $2`,
      [query.limit, offset]
    );

    return {
      success: true,
      data: result.rows.map((row) => ({
        id: row.id,
        deviceId: row.device_id,
        hostname: row.hostname,
        alertType: row.alert_type,
        severity: row.severity,
        message: row.message,
        acknowledged: row.acknowledged,
        acknowledgedBy: row.acknowledged_by,
        acknowledgedAt: row.acknowledged_at,
        createdAt: row.created_at,
      })),
    };
  });
};

export default npmRoutes;
