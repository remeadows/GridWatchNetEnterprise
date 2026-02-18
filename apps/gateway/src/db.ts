/**
 * GridWatch NetEnterprise - API Gateway Database Client
 */

import { Pool, PoolClient } from "pg";
import { config } from "./config";
import { logger } from "./logger";

export const pool = new Pool({
  connectionString: config.POSTGRES_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  logger.error({ err }, "Unexpected PostgreSQL pool error");
});

pool.on("connect", () => {
  logger.debug("New PostgreSQL client connected");
});

/**
 * Execute a query with automatic client release
 */
export async function query<T = unknown>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  logger.debug({ text, duration, rows: result.rowCount }, "Executed query");

  return result.rows as T[];
}

/**
 * Get a client for transactions
 */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

/**
 * Execute a function within a transaction
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check database health
 */
export async function checkHealth(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (error) {
    logger.error({ error }, "Database health check failed");
    return false;
  }
}

/**
 * Gracefully close pool
 */
export async function closePool(): Promise<void> {
  await pool.end();
  logger.info("PostgreSQL pool closed");
}
