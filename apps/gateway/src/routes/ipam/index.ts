/**
 * NetNynja Enterprise - IPAM API Routes
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import * as os from "os";
import * as net from "net";
import { pool } from "../../db";
import { logger } from "../../logger";
import reportsRoutes from "./reports";

const execAsync = promisify(exec);

/**
 * Generate all host IPs from a CIDR notation
 */
function getCidrHosts(cidr: string): string[] {
  const cidrParts = cidr.split("/");
  const baseIp = cidrParts[0];
  const prefixStr = cidrParts[1];

  if (!baseIp || !prefixStr) {
    throw new Error("Invalid CIDR notation");
  }

  const prefix = parseInt(prefixStr, 10);

  if (prefix < 8 || prefix > 30) {
    throw new Error("Only /8 to /30 networks supported");
  }

  const ipParts = baseIp.split(".");
  if (ipParts.length !== 4) {
    throw new Error("Invalid IP address format");
  }

  const parts = ipParts.map((p) => parseInt(p, 10));
  const baseNum =
    ((parts[0] ?? 0) << 24) |
    ((parts[1] ?? 0) << 16) |
    ((parts[2] ?? 0) << 8) |
    (parts[3] ?? 0);
  const hostBits = 32 - prefix;
  const numHosts = Math.pow(2, hostBits);

  // Skip network and broadcast addresses
  const hosts: string[] = [];
  for (let i = 1; i < numHosts - 1; i++) {
    const ip = baseNum + i;
    hosts.push(
      `${(ip >> 24) & 255}.${(ip >> 16) & 255}.${(ip >> 8) & 255}.${ip & 255}`,
    );
  }

  return hosts;
}

/**
 * Ping a single IP address and return result
 */
async function pingHost(
  ip: string,
  timeoutSec: number = 2,
): Promise<{ ip: string; alive: boolean; latency?: number }> {
  const isWindows = os.platform() === "win32";
  const cmd = isWindows
    ? `ping -n 1 -w ${timeoutSec * 1000} ${ip}`
    : `ping -c 1 -W ${timeoutSec} ${ip}`;

  try {
    const { stdout } = await execAsync(cmd, {
      timeout: (timeoutSec + 2) * 1000,
    });

    // Parse latency from output
    let latency: number | undefined;
    if (isWindows) {
      const match =
        stdout.match(/Average\s*=\s*(\d+)ms/i) ||
        stdout.match(/time[=<](\d+)ms/i);
      if (match && match[1]) latency = parseInt(match[1], 10);
    } else {
      const match = stdout.match(/time[=](\d+\.?\d*)\s*ms/i);
      if (match && match[1]) latency = parseFloat(match[1]);
    }

    return { ip, alive: true, latency };
  } catch {
    return { ip, alive: false };
  }
}

/**
 * Run ping scan on a network in batches
 */
async function runPingScan(
  cidr: string,
  scanId: string,
  networkId: string,
  concurrency: number = 20,
): Promise<{ total: number; active: number; newIps: number }> {
  const hosts = getCidrHosts(cidr);
  const totalIps = hosts.length;
  let activeCount = 0;
  let newCount = 0;

  logger.info(
    { scanId, networkId, cidr, totalHosts: totalIps },
    "Starting ping scan",
  );

  // Update scan to running status
  await pool.query(
    `UPDATE ipam.scan_history SET status = 'running', total_ips = $1 WHERE id = $2`,
    [totalIps, scanId],
  );

  // Process in batches
  for (let i = 0; i < hosts.length; i += concurrency) {
    const batch = hosts.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((ip) => pingHost(ip)));

    for (const result of results) {
      if (result.alive) {
        activeCount++;

        // Check if IP already exists in database
        const existingResult = await pool.query(
          `SELECT id FROM ipam.addresses WHERE network_id = $1 AND address = $2`,
          [networkId, result.ip],
        );

        if (existingResult.rows.length === 0) {
          // New IP - insert it
          newCount++;
          await pool.query(
            `INSERT INTO ipam.addresses (network_id, address, status, last_seen)
             VALUES ($1, $2, 'active', NOW())
             ON CONFLICT (network_id, address) DO UPDATE
             SET status = 'active', last_seen = NOW()`,
            [networkId, result.ip],
          );
        } else {
          // Existing IP - update last_seen
          await pool.query(
            `UPDATE ipam.addresses SET status = 'active', last_seen = NOW()
             WHERE network_id = $1 AND address = $2`,
            [networkId, result.ip],
          );
        }
      }
    }
  }

  return { total: totalIps, active: activeCount, newIps: newCount };
}

/**
 * TCP connect to check if a port is open
 */
async function tcpConnect(
  ip: string,
  port: number,
  timeoutMs: number = 2000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const cleanup = (result: boolean) => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(result);
      }
    };

    const timeout = setTimeout(() => {
      cleanup(false);
    }, timeoutMs);

    socket.on("connect", () => {
      clearTimeout(timeout);
      cleanup(true);
    });

    socket.on("error", () => {
      clearTimeout(timeout);
      cleanup(false);
    });

    socket.on("timeout", () => {
      clearTimeout(timeout);
      cleanup(false);
    });

    try {
      socket.connect(port, ip);
    } catch {
      clearTimeout(timeout);
      cleanup(false);
    }
  });
}

/**
 * TCP ping a host by checking common ports
 */
async function tcpPingHost(
  ip: string,
  ports: number[] = [22, 80, 443, 3389, 445, 23, 21, 25, 53, 8080],
  timeoutMs: number = 2000,
): Promise<{ ip: string; alive: boolean; openPorts: number[] }> {
  const openPorts: number[] = [];

  for (const port of ports) {
    const isOpen = await tcpConnect(ip, port, timeoutMs);
    if (isOpen) {
      openPorts.push(port);
      // Return early on first open port for speed
      return { ip, alive: true, openPorts };
    }
  }

  return { ip, alive: openPorts.length > 0, openPorts };
}

/**
 * Run TCP scan on a network in batches
 */
async function runTcpScan(
  cidr: string,
  scanId: string,
  networkId: string,
  concurrency: number = 20,
): Promise<{ total: number; active: number; newIps: number }> {
  const hosts = getCidrHosts(cidr);
  const totalIps = hosts.length;
  let activeCount = 0;
  let newCount = 0;

  logger.info(
    { scanId, networkId, cidr, totalHosts: totalIps },
    "Starting TCP scan",
  );

  // Update scan to running status
  await pool.query(
    `UPDATE ipam.scan_history SET status = 'running', total_ips = $1 WHERE id = $2`,
    [totalIps, scanId],
  );

  // Process in batches
  for (let i = 0; i < hosts.length; i += concurrency) {
    const batch = hosts.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((ip) => tcpPingHost(ip)));

    for (const result of results) {
      if (result.alive) {
        activeCount++;

        // Check if IP already exists in database
        const existingResult = await pool.query(
          `SELECT id FROM ipam.addresses WHERE network_id = $1 AND address = $2`,
          [networkId, result.ip],
        );

        if (existingResult.rows.length === 0) {
          // New IP - insert it
          newCount++;
          await pool.query(
            `INSERT INTO ipam.addresses (network_id, address, status, last_seen)
             VALUES ($1, $2, 'active', NOW())
             ON CONFLICT (network_id, address) DO UPDATE
             SET status = 'active', last_seen = NOW()`,
            [networkId, result.ip],
          );
        } else {
          // Existing IP - update last_seen
          await pool.query(
            `UPDATE ipam.addresses SET status = 'active', last_seen = NOW()
             WHERE network_id = $1 AND address = $2`,
            [networkId, result.ip],
          );
        }
      }
    }
  }

  return { total: totalIps, active: activeCount, newIps: newCount };
}

// Host info extracted from nmap XML
interface NmapHostInfo {
  ip: string;
  hostname?: string;
  mac?: string;
  vendor?: string;
}

/**
 * Run nmap scan on a network with fingerprinting
 */
async function runNmapScan(
  cidr: string,
  scanId: string,
  networkId: string,
): Promise<{ total: number; active: number; newIps: number }> {
  const hosts = getCidrHosts(cidr);
  const totalIps = hosts.length;

  logger.info(
    { scanId, networkId, cidr, totalHosts: totalIps },
    "Starting nmap scan with fingerprinting",
  );

  // Update scan to running status
  await pool.query(
    `UPDATE ipam.scan_history SET status = 'running', total_ips = $1 WHERE id = $2`,
    [totalIps, scanId],
  );

  // Check if nmap is available
  try {
    await execAsync("nmap --version", { timeout: 5000 });
  } catch {
    throw new Error("nmap is not installed or not in PATH");
  }

  // Run nmap ping scan with XML output - added -R for DNS resolution
  const cmd = `nmap -sn -PE -PA80,443 -R -oX - ${cidr}`;

  logger.info({ scanId, cmd }, "Executing nmap command");

  const { stdout } = await execAsync(cmd, { timeout: 300000 }); // 5 minute timeout

  // Parse nmap XML output with fingerprinting info
  const discoveredHosts: NmapHostInfo[] = [];
  const hostRegex = /<host[^>]*>[\s\S]*?<\/host>/g;
  const ipRegex = /<address addr="([^"]+)" addrtype="ipv4"/;
  const macRegex =
    /<address addr="([^"]+)" addrtype="mac"(?:\s+vendor="([^"]*)")?/;
  const hostnameRegex = /<hostname name="([^"]+)"/;
  const statusRegex = /<status state="up"/;

  let match;
  while ((match = hostRegex.exec(stdout)) !== null) {
    const hostXml = match[0];
    if (statusRegex.test(hostXml)) {
      const ipMatch = ipRegex.exec(hostXml);
      if (ipMatch && ipMatch[1]) {
        const hostInfo: NmapHostInfo = { ip: ipMatch[1] };

        // Extract hostname
        const hostnameMatch = hostnameRegex.exec(hostXml);
        if (hostnameMatch && hostnameMatch[1]) {
          hostInfo.hostname = hostnameMatch[1];
        }

        // Extract MAC address and vendor
        const macMatch = macRegex.exec(hostXml);
        if (macMatch) {
          hostInfo.mac = macMatch[1];
          if (macMatch[2]) {
            hostInfo.vendor = macMatch[2];
          }
        }

        discoveredHosts.push(hostInfo);
      }
    }
  }

  let newCount = 0;

  // Save discovered IPs to database with fingerprint data
  for (const host of discoveredHosts) {
    const existingResult = await pool.query(
      `SELECT id FROM ipam.addresses WHERE network_id = $1 AND address = $2`,
      [networkId, host.ip],
    );

    if (existingResult.rows.length === 0) {
      newCount++;
      await pool.query(
        `INSERT INTO ipam.addresses (network_id, address, hostname, mac_address, device_type, status, last_seen, discovered_at)
         VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW())
         ON CONFLICT (network_id, address) DO UPDATE
         SET status = 'active', last_seen = NOW(),
             hostname = COALESCE(EXCLUDED.hostname, ipam.addresses.hostname),
             mac_address = COALESCE(EXCLUDED.mac_address, ipam.addresses.mac_address),
             device_type = COALESCE(EXCLUDED.device_type, ipam.addresses.device_type)`,
        [
          networkId,
          host.ip,
          host.hostname || null,
          host.mac || null,
          host.vendor || null,
        ],
      );
    } else {
      // Update existing - preserve existing data if nmap didn't find it
      await pool.query(
        `UPDATE ipam.addresses
         SET status = 'active',
             last_seen = NOW(),
             hostname = COALESCE($3, hostname),
             mac_address = COALESCE($4, mac_address),
             device_type = COALESCE($5, device_type)
         WHERE network_id = $1 AND address = $2`,
        [
          networkId,
          host.ip,
          host.hostname || null,
          host.mac || null,
          host.vendor || null,
        ],
      );
    }
  }

  logger.info(
    {
      scanId,
      activeCount: discoveredHosts.length,
      newCount,
      withHostnames: discoveredHosts.filter((h) => h.hostname).length,
      withMacs: discoveredHosts.filter((h) => h.mac).length,
    },
    "nmap scan with fingerprinting completed",
  );

  return { total: totalIps, active: discoveredHosts.length, newIps: newCount };
}

// Zod schemas
const networkSchema = z.object({
  network: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  vlanId: z.number().int().min(1).max(4094).optional(),
  location: z.string().max(255).optional(),
  gateway: z.string().ip().optional(),
  site: z.string().max(255).optional(),
  isActive: z.boolean().optional(),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

// Schema for adding IPAM addresses to NPM monitoring
const addToNpmSchema = z.object({
  addressIds: z.array(z.string().uuid()).min(1).max(100),
  pollIcmp: z.boolean().default(true),
  pollSnmp: z.boolean().default(false),
  snmpv3CredentialId: z.string().uuid().optional(),
  pollInterval: z.number().int().min(30).max(3600).default(60),
});

const ipamRoutes: FastifyPluginAsync = async (fastify) => {
  // Require authentication for all IPAM routes
  fastify.addHook("preHandler", fastify.requireAuth);

  // Register reports sub-routes
  await fastify.register(reportsRoutes);

  // List networks
  fastify.get(
    "/networks",
    {
      schema: {
        tags: ["IPAM - Networks"],
        summary: "List networks",
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
        ? `WHERE name ILIKE $3 OR network::text ILIKE $3`
        : "";
      const searchParam = query.search ? `%${query.search}%` : null;

      const countQuery = `SELECT COUNT(*) FROM ipam.networks ${searchCondition}`;
      const dataQuery = `
      SELECT id, network, name, description, vlan_id, location, site, gateway, is_active, created_at, updated_at
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
          site: row.site,
          gateway: row.gateway,
          isActive: row.is_active,
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

  // Get network by ID
  fastify.get(
    "/networks/:id",
    {
      schema: {
        tags: ["IPAM - Networks"],
        summary: "Get network by ID",
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
        `SELECT id, network, name, description, vlan_id, location, site, gateway, is_active, created_at, updated_at
       FROM ipam.networks WHERE id = $1`,
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Network not found" },
        };
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
          site: row.site,
          gateway: row.gateway,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Create network
  fastify.post(
    "/networks",
    {
      schema: {
        tags: ["IPAM - Networks"],
        summary: "Create a new network",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["network", "name"],
          properties: {
            network: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            vlanId: { type: "number" },
            location: { type: "string" },
            site: { type: "string" },
            gateway: { type: "string" },
            isActive: { type: "boolean" },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const body = networkSchema.parse(request.body);

      const result = await pool.query(
        `INSERT INTO ipam.networks (network, name, description, vlan_id, location, site, gateway, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, true))
       RETURNING id, network, name, description, vlan_id, location, site, gateway, is_active, created_at, updated_at`,
        [
          body.network,
          body.name,
          body.description,
          body.vlanId,
          body.location,
          body.site,
          body.gateway,
          body.isActive,
        ],
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
          site: row.site,
          gateway: row.gateway,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Update network
  fastify.put(
    "/networks/:id",
    {
      schema: {
        tags: ["IPAM - Networks"],
        summary: "Update a network",
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
      if (body.site !== undefined) {
        updates.push(`site = $${paramIndex++}`);
        values.push(body.site);
      }
      if (body.gateway !== undefined) {
        updates.push(`gateway = $${paramIndex++}`);
        values.push(body.gateway);
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
        `UPDATE ipam.networks SET ${updates.join(", ")}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING id, network, name, description, vlan_id, location, site, gateway, is_active, created_at, updated_at`,
        values,
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Network not found" },
        };
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
          site: row.site,
          gateway: row.gateway,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  );

  // Delete network
  fastify.delete(
    "/networks/:id",
    {
      schema: {
        tags: ["IPAM - Networks"],
        summary: "Delete a network",
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

      const result = await pool.query(
        "DELETE FROM ipam.networks WHERE id = $1 RETURNING id",
        [id],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Network not found" },
        };
      }

      return reply.status(204).send();
    },
  );

  // List IP addresses in a network
  fastify.get(
    "/networks/:id/addresses",
    {
      schema: {
        tags: ["IPAM - Addresses"],
        summary: "List IP addresses in a network",
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
      const query = querySchema.parse(request.query);
      const offset = (query.page - 1) * query.limit;

      const countResult = await pool.query(
        "SELECT COUNT(*) FROM ipam.addresses WHERE network_id = $1",
        [id],
      );

      const dataResult = await pool.query(
        `SELECT id, address, hostname, fqdn, mac_address, status, device_type, description, last_seen, discovered_at, created_at, updated_at
       FROM ipam.addresses
       WHERE network_id = $1
       ORDER BY address
       LIMIT $2 OFFSET $3`,
        [id, query.limit, offset],
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
          pages: Math.ceil(
            parseInt(countResult.rows[0].count, 10) / query.limit,
          ),
        },
      };
    },
  );

  // Start network scan
  fastify.post(
    "/networks/:id/scan",
    {
      schema: {
        tags: ["IPAM - Scans"],
        summary: "Start a network scan",
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
            scanType: {
              type: "string",
              enum: ["ping", "tcp", "arp", "nmap"],
              default: "ping",
            },
            scanTypes: {
              type: "array",
              items: {
                type: "string",
                enum: ["ping", "tcp", "nmap"],
              },
              minItems: 1,
              maxItems: 3,
            },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        scanType?: string;
        scanTypes?: string[];
      };

      // Support both old single scanType and new array scanTypes
      const scanTypesToRun: string[] =
        body.scanTypes && body.scanTypes.length > 0
          ? body.scanTypes
          : [body.scanType || "ping"];

      // Remove duplicates
      const uniqueScanTypes = [...new Set(scanTypesToRun)];

      // Verify network exists
      const networkResult = await pool.query(
        "SELECT id, network, name FROM ipam.networks WHERE id = $1",
        [id],
      );

      if (networkResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Network not found" },
        };
      }

      // Create scan job with combined scan types
      const combinedScanType = uniqueScanTypes.join("+");
      const scanResult = await pool.query(
        `INSERT INTO ipam.scan_history (network_id, scan_type, started_at, status)
       VALUES ($1, $2, NOW(), 'pending')
       RETURNING id, network_id, scan_type, status, started_at`,
        [id, combinedScanType],
      );

      const scan = scanResult.rows[0];
      const network = networkResult.rows[0];

      logger.info(
        { networkId: id, scanId: scan.id, scanTypes: uniqueScanTypes },
        "Multi-type scan started",
      );

      // Run scan in background (don't await - return immediately)
      // Execute scan asynchronously - use setImmediate to ensure it runs on next tick
      setImmediate(async () => {
        logger.info(
          {
            scanId: scan.id,
            scanTypes: uniqueScanTypes,
            networkCidr: network.network,
          },
          "Background multi-type scan starting",
        );
        try {
          // Track cumulative results across all scan types
          let totalResult = { total: 0, active: 0, newIps: 0 };
          const discoveredIps = new Set<string>();

          // Run each scan type sequentially
          for (const scanType of uniqueScanTypes) {
            logger.info({ scanId: scan.id, scanType }, "Running scan type");

            let result: { total: number; active: number; newIps: number };

            switch (scanType) {
              case "ping":
                result = await runPingScan(network.network, scan.id, id, 20);
                break;
              case "tcp":
                result = await runTcpScan(network.network, scan.id, id, 20);
                break;
              case "nmap":
                result = await runNmapScan(network.network, scan.id, id);
                break;
              default:
                // Skip unknown types
                continue;
            }

            // Total IPs should be the same for all scan types (subnet size)
            totalResult.total = result.total;
            // Active and new IPs accumulate (union - each subsequent scan may find more)
            totalResult.active = Math.max(totalResult.active, result.active);
            totalResult.newIps += result.newIps;
          }

          // Update scan as completed
          await pool.query(
            `UPDATE ipam.scan_history
             SET status = 'completed',
                 completed_at = NOW(),
                 total_ips = $1,
                 active_ips = $2,
                 new_ips = $3
             WHERE id = $4`,
            [
              totalResult.total,
              totalResult.active,
              totalResult.newIps,
              scan.id,
            ],
          );

          logger.info(
            {
              scanId: scan.id,
              scanTypes: uniqueScanTypes,
              totalIps: totalResult.total,
              activeIps: totalResult.active,
              newIps: totalResult.newIps,
            },
            "Multi-type scan completed",
          );
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          const errorStack = err instanceof Error ? err.stack : undefined;
          logger.error(
            {
              scanId: scan.id,
              scanTypes: uniqueScanTypes,
              error: errorMessage,
              stack: errorStack,
            },
            "Scan failed",
          );
          try {
            await pool.query(
              `UPDATE ipam.scan_history
               SET status = 'failed', completed_at = NOW(), error_message = $1
               WHERE id = $2`,
              [errorMessage, scan.id],
            );
          } catch (dbErr) {
            logger.error(
              { scanId: scan.id, dbError: dbErr },
              "Failed to update scan status after error",
            );
          }
        }
      });

      return {
        success: true,
        data: {
          id: scan.id,
          networkId: scan.network_id,
          scanType: scan.scan_type,
          status: "running",
          startedAt: scan.started_at,
        },
        message: `Scan started with ${uniqueScanTypes.length} scan type(s): ${uniqueScanTypes.join(", ")}`,
      };
    },
  );

  // Get scan status
  fastify.get(
    "/scans/:scanId",
    {
      schema: {
        tags: ["IPAM - Scans"],
        summary: "Get scan status",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            scanId: { type: "string", format: "uuid" },
          },
          required: ["scanId"],
        },
      },
    },
    async (request, reply) => {
      const { scanId } = request.params as { scanId: string };

      const result = await pool.query(
        `SELECT id, network_id, scan_type, status, started_at, completed_at, total_ips, active_ips, new_ips, error_message
       FROM ipam.scan_history WHERE id = $1`,
        [scanId],
      );

      if (result.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Scan not found" },
        };
      }

      const scan = result.rows[0];
      return {
        success: true,
        data: {
          id: scan.id,
          networkId: scan.network_id,
          scanType: scan.scan_type,
          status: scan.status,
          startedAt: scan.started_at,
          completedAt: scan.completed_at,
          totalIps: scan.total_ips,
          activeIps: scan.active_ips,
          newIps: scan.new_ips,
          errorMessage: scan.error_message,
        },
      };
    },
  );

  // List scans for a network
  fastify.get(
    "/networks/:id/scans",
    {
      schema: {
        tags: ["IPAM - Scans"],
        summary: "List scans for a network",
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
      const query = querySchema.parse(request.query);

      const result = await pool.query(
        `SELECT id, network_id, scan_type, status, started_at, completed_at, total_ips, active_ips, new_ips
       FROM ipam.scan_history
       WHERE network_id = $1
       ORDER BY started_at DESC
       LIMIT $2`,
        [id, query.limit],
      );

      return {
        success: true,
        data: result.rows.map((scan) => ({
          id: scan.id,
          networkId: scan.network_id,
          scanType: scan.scan_type,
          status: scan.status,
          startedAt: scan.started_at,
          completedAt: scan.completed_at,
          totalIps: scan.total_ips,
          activeIps: scan.active_ips,
          newIps: scan.new_ips,
        })),
      };
    },
  );

  // Delete scan
  fastify.delete(
    "/scans/:scanId",
    {
      schema: {
        tags: ["IPAM - Scans"],
        summary: "Delete a scan from history",
        description:
          "Delete a completed or failed scan from history. Running scans cannot be deleted.",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            scanId: { type: "string", format: "uuid" },
          },
          required: ["scanId"],
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const { scanId } = request.params as { scanId: string };

      // Check if scan exists and get its status
      const statusCheck = await pool.query(
        "SELECT id, status FROM ipam.scan_history WHERE id = $1",
        [scanId],
      );

      if (statusCheck.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Scan not found" },
        };
      }

      // Don't allow deletion of running scans
      if (statusCheck.rows[0].status === "running") {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message:
              "Cannot delete a running scan. Wait for it to complete or fail.",
          },
        };
      }

      // Delete the scan
      await pool.query("DELETE FROM ipam.scan_history WHERE id = $1", [scanId]);

      logger.info({ scanId }, "Scan deleted");

      return reply.status(204).send();
    },
  );

  // IPAM Dashboard
  fastify.get(
    "/dashboard",
    {
      schema: {
        tags: ["IPAM - Dashboard"],
        summary: "Get IPAM dashboard statistics",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      // Get network stats
      const networkStats = await pool.query(`
      SELECT
        COUNT(*) as total_networks,
        COUNT(*) FILTER (WHERE is_active) as active_networks
      FROM ipam.networks
    `);

      // Get address stats
      const addressStats = await pool.query(`
      SELECT
        COUNT(*) as total_addresses,
        COUNT(*) FILTER (WHERE status = 'active') as active_addresses,
        COUNT(*) FILTER (WHERE status = 'inactive') as inactive_addresses,
        COUNT(*) FILTER (WHERE status = 'reserved') as reserved_addresses
      FROM ipam.addresses
    `);

      // Get recent scans
      const recentScans = await pool.query(`
      SELECT COUNT(*) as recent_scans
      FROM ipam.scan_history
      WHERE started_at > NOW() - INTERVAL '24 hours'
    `);

      // Calculate average utilization
      const utilization = await pool.query(`
      WITH network_stats AS (
        SELECT
          n.id,
          (host(broadcast(n.network::inet)) - host(network(n.network::inet)))::int - 1 as capacity,
          COUNT(a.id) as used
        FROM ipam.networks n
        LEFT JOIN ipam.addresses a ON a.network_id = n.id
        GROUP BY n.id, n.network
      )
      SELECT
        AVG(CASE WHEN capacity > 0 THEN (used::float / capacity * 100) ELSE 0 END) as avg_utilization
      FROM network_stats
    `);

      return {
        success: true,
        data: {
          totalNetworks: parseInt(networkStats.rows[0].total_networks, 10),
          activeNetworks: parseInt(networkStats.rows[0].active_networks, 10),
          totalAddresses: parseInt(addressStats.rows[0].total_addresses, 10),
          activeAddresses: parseInt(addressStats.rows[0].active_addresses, 10),
          inactiveAddresses: parseInt(
            addressStats.rows[0].inactive_addresses,
            10,
          ),
          reservedAddresses: parseInt(
            addressStats.rows[0].reserved_addresses,
            10,
          ),
          recentScans: parseInt(recentScans.rows[0].recent_scans, 10),
          averageUtilization: parseFloat(
            utilization.rows[0].avg_utilization || 0,
          ).toFixed(2),
        },
      };
    },
  );

  // Add IPAM discovered addresses to NPM monitoring
  fastify.post(
    "/addresses/add-to-npm",
    {
      schema: {
        tags: ["IPAM - NPM Integration"],
        summary: "Add discovered IP addresses to NPM monitoring",
        description:
          "Creates NPM devices from IPAM discovered addresses. Skips addresses already in NPM.",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["addressIds"],
          properties: {
            addressIds: {
              type: "array",
              items: { type: "string", format: "uuid" },
              minItems: 1,
              maxItems: 100,
            },
            pollIcmp: { type: "boolean", default: true },
            pollSnmp: { type: "boolean", default: false },
            snmpv3CredentialId: { type: "string", format: "uuid" },
            pollInterval: {
              type: "number",
              minimum: 30,
              maximum: 3600,
              default: 60,
            },
          },
        },
      },
      preHandler: [fastify.requireRole("admin", "operator")],
    },
    async (request, reply) => {
      const body = addToNpmSchema.parse(request.body);

      // Validate at least one polling method is enabled
      if (!body.pollIcmp && !body.pollSnmp) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "At least one polling method (ICMP or SNMP) must be enabled",
          },
        };
      }

      // Validate SNMPv3 credential if SNMP is enabled
      if (body.pollSnmp && !body.snmpv3CredentialId) {
        reply.status(400);
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "SNMPv3 credential is required when SNMP polling is enabled",
          },
        };
      }

      // If SNMPv3 credential ID is provided, verify it exists
      if (body.snmpv3CredentialId) {
        const credCheck = await pool.query(
          "SELECT id FROM npm.snmpv3_credentials WHERE id = $1",
          [body.snmpv3CredentialId],
        );
        if (credCheck.rows.length === 0) {
          reply.status(400);
          return {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "SNMPv3 credential not found",
            },
          };
        }
      }

      // Get IPAM addresses
      const addressResult = await pool.query(
        `SELECT id, address, hostname, mac_address, device_type
         FROM ipam.addresses
         WHERE id = ANY($1)`,
        [body.addressIds],
      );

      if (addressResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "No matching addresses found" },
        };
      }

      // Check which addresses already exist in NPM
      const ipAddresses = addressResult.rows.map((r) => r.address);
      const existingResult = await pool.query(
        `SELECT ip_address FROM npm.devices WHERE ip_address = ANY($1)`,
        [ipAddresses],
      );
      const existingIps = new Set(existingResult.rows.map((r) => r.ip_address));

      // Filter out addresses that already exist in NPM
      const newAddresses = addressResult.rows.filter(
        (r) => !existingIps.has(r.address),
      );

      if (newAddresses.length === 0) {
        return {
          success: true,
          data: {
            addedCount: 0,
            skippedCount: addressResult.rows.length,
            message: "All selected addresses are already in NPM monitoring",
          },
        };
      }

      // Insert new devices into NPM
      const addedDevices = [];
      for (const addr of newAddresses) {
        const deviceName = addr.hostname || addr.address;
        const result = await pool.query(
          `INSERT INTO npm.devices (name, ip_address, device_type, poll_icmp, poll_snmp,
                                    snmpv3_credential_id, poll_interval, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)
           RETURNING id, name, ip_address`,
          [
            deviceName,
            addr.address,
            addr.device_type,
            body.pollIcmp,
            body.pollSnmp,
            body.snmpv3CredentialId || null,
            body.pollInterval,
          ],
        );
        addedDevices.push(result.rows[0]);
      }

      logger.info(
        { addedCount: addedDevices.length, skippedCount: existingIps.size },
        "IPAM addresses added to NPM monitoring",
      );

      return {
        success: true,
        data: {
          addedCount: addedDevices.length,
          skippedCount: addressResult.rows.length - addedDevices.length,
          addedDevices: addedDevices.map((d) => ({
            id: d.id,
            name: d.name,
            ipAddress: d.ip_address,
          })),
        },
      };
    },
  );
};

export default ipamRoutes;
