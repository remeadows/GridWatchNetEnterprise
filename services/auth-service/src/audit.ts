/**
 * GridWatch NetEnterprise - Auth Service Audit Logging
 */

import { query } from "./db";
import { logger } from "./logger";
import type { AuditModule } from "@gridwatch/shared-types";

export interface AuditEvent {
  userId?: string;
  action: string;
  module?: AuditModule;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log an audit event to the database
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  const {
    userId,
    action,
    module = "auth",
    resourceType,
    resourceId,
    details,
    ipAddress,
    userAgent,
  } = event;

  try {
    await query(
      `INSERT INTO shared.audit_log
       (user_id, action, module, resource_type, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId || null,
        action,
        module,
        resourceType || null,
        resourceId || null,
        details ? JSON.stringify(details) : null,
        ipAddress || null,
        userAgent || null,
      ],
    );

    logger.debug({ action, userId, module }, "Audit event logged");
  } catch (error) {
    // Don't throw - audit logging should not break the main flow
    logger.error({ error, event }, "Failed to log audit event");
  }
}

// ============================================
// Auth-specific audit actions
// ============================================

export const AuditActions = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  LOGOUT_ALL: "LOGOUT_ALL",
  TOKEN_REFRESH: "TOKEN_REFRESH",
  TOKEN_REFRESH_FAILED: "TOKEN_REFRESH_FAILED",
  PASSWORD_CHANGE: "PASSWORD_CHANGE",
  PASSWORD_RESET_REQUEST: "PASSWORD_RESET_REQUEST",
  PASSWORD_RESET_COMPLETE: "PASSWORD_RESET_COMPLETE",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  ACCOUNT_UNLOCKED: "ACCOUNT_UNLOCKED",
  USER_CREATED: "USER_CREATED",
  USER_UPDATED: "USER_UPDATED",
  USER_DELETED: "USER_DELETED",
  ROLE_CHANGED: "ROLE_CHANGED",
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

/**
 * Log a login success event
 */
export async function logLoginSuccess(
  userId: string,
  username: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<void> {
  await logAuditEvent({
    userId,
    action: AuditActions.LOGIN_SUCCESS,
    resourceType: "user",
    resourceId: userId,
    details: { username },
    ipAddress,
    userAgent,
  });
}

/**
 * Log a login failure event
 */
export async function logLoginFailed(
  username: string,
  reason: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<void> {
  await logAuditEvent({
    action: AuditActions.LOGIN_FAILED,
    resourceType: "user",
    details: { username, reason },
    ipAddress,
    userAgent,
  });
}

/**
 * Log a logout event
 */
export async function logLogout(
  userId: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<void> {
  await logAuditEvent({
    userId,
    action: AuditActions.LOGOUT,
    resourceType: "user",
    resourceId: userId,
    ipAddress,
    userAgent,
  });
}

/**
 * Log a logout all devices event
 */
export async function logLogoutAll(
  userId: string,
  sessionCount: number,
  ipAddress?: string,
  userAgent?: string,
): Promise<void> {
  await logAuditEvent({
    userId,
    action: AuditActions.LOGOUT_ALL,
    resourceType: "user",
    resourceId: userId,
    details: { sessionCount },
    ipAddress,
    userAgent,
  });
}

/**
 * Log a token refresh event
 */
export async function logTokenRefresh(
  userId: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<void> {
  await logAuditEvent({
    userId,
    action: AuditActions.TOKEN_REFRESH,
    resourceType: "user",
    resourceId: userId,
    ipAddress,
    userAgent,
  });
}

/**
 * Log an account locked event
 */
export async function logAccountLocked(
  username: string,
  attempts: number,
  ipAddress?: string,
): Promise<void> {
  await logAuditEvent({
    action: AuditActions.ACCOUNT_LOCKED,
    resourceType: "user",
    details: { username, attempts },
    ipAddress,
  });
}
