/**
 * GridWatch NetEnterprise - Shared Type Definitions
 * Common types used across all modules
 */

import { z } from "zod";

// ============================================
// Common Types
// ============================================

export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================
// User & Authentication
// ============================================

export type UserRole = "admin" | "operator" | "viewer";

export interface User extends BaseEntity {
  username: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLogin?: Date;
  failedLoginAttempts?: number;
}

export interface JWTPayload {
  sub: string; // user ID
  username: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Zod Schemas for validation
export const LoginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(128),
});

export const RegisterSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum(["admin", "operator", "viewer"]).default("viewer"),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;

// ============================================
// Audit Log
// ============================================

export type AuditModule = "ipam" | "npm" | "stig" | "auth" | "system";

export interface AuditLogEntry extends BaseEntity {
  userId?: string;
  action: string;
  module: AuditModule;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

// ============================================
// Health Check
// ============================================

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime: number;
  timestamp: string;
  services: ServiceHealth[];
}

export interface ServiceHealth {
  name: string;
  status: "up" | "down" | "degraded";
  latency?: number;
  message?: string;
}

// ============================================
// Export modules
// ============================================

export * from "./ipam";
export * from "./npm";
export * from "./stig";
