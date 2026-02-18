/**
 * GridWatch NetEnterprise - E2E Test User Setup Script
 * Creates test users with proper Argon2id password hashes
 *
 * Run with: npx tsx Testing/setup-test-users.ts
 */

import * as argon2 from "argon2";
import pg from "pg";

const { Pool } = pg;

// Test user credentials (must match conftest.py)
const TEST_USERS = [
  {
    username: "e2e_admin",
    email: "e2e_admin@test.local",
    password: "E2EAdminPass123",
    role: "admin",
  },
  {
    username: "e2e_operator",
    email: "e2e_operator@test.local",
    password: "E2EOperatorPass123",
    role: "operator",
  },
  {
    username: "e2e_viewer",
    email: "e2e_viewer@test.local",
    password: "E2EViewerPass123",
    role: "viewer",
  },
];

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
    hashLength: 32,
  });
}

async function main() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT || "5433", 10),
    user: process.env.POSTGRES_USER || "GridWatch",
    password: process.env.POSTGRES_PASSWORD || "GridWatch-dev-2025",
    database: process.env.POSTGRES_DB || "GridWatch",
  });

  console.log("🔐 Setting up E2E test users...\n");

  try {
    for (const user of TEST_USERS) {
      console.log(`Creating user: ${user.username} (${user.role})`);

      const passwordHash = await hashPassword(user.password);

      // Upsert user
      await pool.query(
        `INSERT INTO shared.users (username, email, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (username) DO UPDATE SET
           email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           is_active = true,
           updated_at = NOW()`,
        [user.username, user.email, passwordHash, user.role],
      );

      console.log(`  ✓ Created/updated ${user.username}`);
    }

    // Verify users were created
    const result = await pool.query(
      `SELECT username, email, role, is_active FROM shared.users WHERE username LIKE 'e2e_%'`,
    );

    console.log("\n📋 E2E Test Users:");
    console.table(result.rows);

    console.log("\n✅ E2E test users setup complete!");
  } catch (error) {
    console.error("❌ Error setting up test users:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
