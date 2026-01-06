/**
 * NetNynja Enterprise - IPAM API Routes
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db';
import { logger } from '../../logger';

// Zod schemas
const networkSchema = z.object({
  network: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  vlanId: z.number().int().min(1).max(4094).optional(),
  location: z.string().max(255).optional(),
  gateway: z.string().ip().optional(),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

const ipamRoutes: FastifyPluginAsync = async (fastify) => {
  // Require authentication for all IPAM routes
  fastify.addHook('preHandler', fastify.requireAuth);

  // List networks
  fastify.get('/networks', {
    schema: {
      tags: ['IPAM - Networks'],
      summary: 'List networks',
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
      ? `WHERE name ILIKE $3 OR network::text ILIKE $3`
      : '';
    const searchParam = query.search ? `%${query.search}%` : null;

    const countQuery = `SELECT COUNT(*) FROM ipam.networks ${searchCondition}`;
    const dataQuery = `
      SELECT id, network, name, description, vlan_id, location, gateway, is_active, created_at, updated_at
      FROM ipam.networks
      ${searchCondition}
      ORDER BY network
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
        network: row.network,
        name: row.name,
        description: row.description,
        vlanId: row.vlan_id,
        location: row.location,
        gateway: row.gateway,
        isActive: row.is_active,
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

  // Get network by ID
  fastify.get('/networks/:id', {
    schema: {
      tags: ['IPAM - Networks'],
      summary: 'Get network by ID',
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
      `SELECT id, network, name, description, vlan_id, location, gateway, is_active, created_at, updated_at
       FROM ipam.networks WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { success: false, error: { code: 'NOT_FOUND', message: 'Network not found' } };
    }

    const row = result.rows[0];
    return {
      success: true,
      data: {
        id: row.id,
        network: row.network,
        name: row.name,
        description: row.description,
        vlanId: row.vlan_id,
        location: row.location,
        gateway: row.gateway,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  });

  // Create network
  fastify.post('/networks', {
    schema: {
      tags: ['IPAM - Networks'],
      summary: 'Create a new network',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['network', 'name'],
        properties: {
          network: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          vlanId: { type: 'number' },
          location: { type: 'string' },
          gateway: { type: 'string' },
        },
      },
    },
    preHandler: [fastify.requireRole('admin', 'operator')],
  }, async (request, reply) => {
    const body = networkSchema.parse(request.body);

    const result = await pool.query(
      `INSERT INTO ipam.networks (network, name, description, vlan_id, location, gateway)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, network, name, description, vlan_id, location, gateway, is_active, created_at, updated_at`,
      [body.network, body.name, body.description, body.vlanId, body.location, body.gateway]
    );

    const row = result.rows[0];
    reply.status(201);
    return {
      success: true,
      data: {
        id: row.id,
        network: row.network,
        name: row.name,
        description: row.description,
        vlanId: row.vlan_id,
        location: row.location,
        gateway: row.gateway,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  });

  // Update network
  fastify.put('/networks/:id', {
    schema: {
      tags: ['IPAM - Networks'],
      summary: 'Update a network',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
    preHandler: [fastify.requireRole('admin', 'operator')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = networkSchema.partial().parse(request.body);

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (body.network) {
      updates.push(`network = $${paramIndex++}`);
      values.push(body.network);
    }
    if (body.name) {
      updates.push(`name = $${paramIndex++}`);
      values.push(body.name);
    }
    if (body.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(body.description);
    }
    if (body.vlanId !== undefined) {
      updates.push(`vlan_id = $${paramIndex++}`);
      values.push(body.vlanId);
    }
    if (body.location !== undefined) {
      updates.push(`location = $${paramIndex++}`);
      values.push(body.location);
    }
    if (body.gateway !== undefined) {
      updates.push(`gateway = $${paramIndex++}`);
      values.push(body.gateway);
    }

    if (updates.length === 0) {
      reply.status(400);
      return { success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } };
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE ipam.networks SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING id, network, name, description, vlan_id, location, gateway, is_active, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { success: false, error: { code: 'NOT_FOUND', message: 'Network not found' } };
    }

    const row = result.rows[0];
    return {
      success: true,
      data: {
        id: row.id,
        network: row.network,
        name: row.name,
        description: row.description,
        vlanId: row.vlan_id,
        location: row.location,
        gateway: row.gateway,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  });

  // Delete network
  fastify.delete('/networks/:id', {
    schema: {
      tags: ['IPAM - Networks'],
      summary: 'Delete a network',
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
      'DELETE FROM ipam.networks WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404);
      return { success: false, error: { code: 'NOT_FOUND', message: 'Network not found' } };
    }

    reply.status(204).send();
  });

  // List IP addresses in a network
  fastify.get('/networks/:id/addresses', {
    schema: {
      tags: ['IPAM - Addresses'],
      summary: 'List IP addresses in a network',
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
    const query = querySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM ipam.addresses WHERE network_id = $1',
      [id]
    );

    const dataResult = await pool.query(
      `SELECT id, address, hostname, fqdn, mac_address, status, device_type, description, last_seen, discovered_at, created_at, updated_at
       FROM ipam.addresses
       WHERE network_id = $1
       ORDER BY address
       LIMIT $2 OFFSET $3`,
      [id, query.limit, offset]
    );

    return {
      success: true,
      data: dataResult.rows.map((row) => ({
        id: row.id,
        address: row.address,
        hostname: row.hostname,
        fqdn: row.fqdn,
        macAddress: row.mac_address,
        status: row.status,
        deviceType: row.device_type,
        description: row.description,
        lastSeen: row.last_seen,
        discoveredAt: row.discovered_at,
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
};

export default ipamRoutes;
