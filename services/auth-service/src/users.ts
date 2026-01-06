/**
 * NetNynja Enterprise - User Repository
 */

import { query } from './db';
import type { User, UserRole } from '@netnynja/shared-types';

export interface DbUser {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  last_login: Date | null;
  failed_login_attempts: number;
  locked_until: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Find a user by username
 */
export async function findByUsername(username: string): Promise<DbUser | null> {
  const rows = await query<DbUser>(
    `SELECT id, username, email, password_hash, role, is_active,
            last_login, failed_login_attempts, locked_until, created_at, updated_at
     FROM shared.users
     WHERE username = $1`,
    [username]
  );

  return rows[0] || null;
}

/**
 * Find a user by ID
 */
export async function findById(id: string): Promise<DbUser | null> {
  const rows = await query<DbUser>(
    `SELECT id, username, email, password_hash, role, is_active,
            last_login, failed_login_attempts, locked_until, created_at, updated_at
     FROM shared.users
     WHERE id = $1`,
    [id]
  );

  return rows[0] || null;
}

/**
 * Find a user by email
 */
export async function findByEmail(email: string): Promise<DbUser | null> {
  const rows = await query<DbUser>(
    `SELECT id, username, email, password_hash, role, is_active,
            last_login, failed_login_attempts, locked_until, created_at, updated_at
     FROM shared.users
     WHERE email = $1`,
    [email]
  );

  return rows[0] || null;
}

/**
 * Update last login timestamp
 */
export async function updateLastLogin(userId: string): Promise<void> {
  await query(
    `UPDATE shared.users SET last_login = NOW() WHERE id = $1`,
    [userId]
  );
}

/**
 * Increment failed login attempts
 */
export async function incrementFailedAttempts(userId: string): Promise<number> {
  const rows = await query<{ failed_login_attempts: number }>(
    `UPDATE shared.users
     SET failed_login_attempts = failed_login_attempts + 1
     WHERE id = $1
     RETURNING failed_login_attempts`,
    [userId]
  );

  return rows[0]?.failed_login_attempts || 0;
}

/**
 * Reset failed login attempts
 */
export async function resetFailedAttempts(userId: string): Promise<void> {
  await query(
    `UPDATE shared.users
     SET failed_login_attempts = 0, locked_until = NULL
     WHERE id = $1`,
    [userId]
  );
}

/**
 * Lock a user account
 */
export async function lockAccount(userId: string, lockUntil: Date): Promise<void> {
  await query(
    `UPDATE shared.users SET locked_until = $2 WHERE id = $1`,
    [userId, lockUntil]
  );
}

/**
 * Check if a user account is locked
 */
export async function isLocked(userId: string): Promise<boolean> {
  const rows = await query<{ locked_until: Date | null }>(
    `SELECT locked_until FROM shared.users WHERE id = $1`,
    [userId]
  );

  const lockedUntil = rows[0]?.locked_until;
  if (!lockedUntil) return false;

  return new Date(lockedUntil) > new Date();
}

/**
 * Update password hash
 */
export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await query(
    `UPDATE shared.users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
    [userId, passwordHash]
  );
}

/**
 * Create a new user
 */
export async function createUser(
  username: string,
  email: string,
  passwordHash: string,
  role: UserRole = 'viewer'
): Promise<DbUser> {
  const rows = await query<DbUser>(
    `INSERT INTO shared.users (username, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, email, password_hash, role, is_active,
               last_login, failed_login_attempts, locked_until, created_at, updated_at`,
    [username, email, passwordHash, role]
  );

  return rows[0];
}

/**
 * Convert database user to API user (without sensitive fields)
 */
export function toApiUser(dbUser: DbUser): User {
  return {
    id: dbUser.id,
    username: dbUser.username,
    email: dbUser.email,
    role: dbUser.role,
    isActive: dbUser.is_active,
    lastLogin: dbUser.last_login || undefined,
    createdAt: dbUser.created_at,
    updatedAt: dbUser.updated_at,
  };
}
