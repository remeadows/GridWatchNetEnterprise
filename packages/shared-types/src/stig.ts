/**
 * NetNynja STIG Manager - Type Definitions
 */

import { z } from "zod";
import type { BaseEntity } from "./index";

// ============================================
// Target Types
// ============================================

export interface Target extends BaseEntity {
  name: string;
  ipAddress: string;
  platform: Platform;
  osVersion?: string;
  connectionType: ConnectionType;
  credentialId?: string; // Vault reference (legacy)
  sshCredentialId?: string | null; // SSH credential reference
  port?: number;
  isActive: boolean;
  lastAudit?: Date;
}

export type Platform =
  | "linux"
  | "macos"
  | "windows"
  | "cisco_ios"
  | "cisco_nxos"
  | "arista_eos"
  | "hp_procurve"
  | "mellanox"
  | "juniper_srx"
  | "juniper_junos"
  | "pfsense"
  | "paloalto"
  | "fortinet"
  | "f5_bigip"
  | "vmware_esxi"
  | "vmware_vcenter";

export type ConnectionType = "ssh" | "netmiko" | "winrm" | "api";

// ============================================
// STIG Definition Types
// ============================================

export interface STIGDefinition extends BaseEntity {
  stigId: string;
  title: string;
  version?: string;
  releaseDate?: Date;
  platform: string;
  description?: string;
  rulesCount: number;
}

export interface STIGRule {
  id: string;
  ruleId: string; // e.g., SV-12345r1_rule
  vulnId: string; // e.g., V-12345
  groupId: string; // e.g., SRG-OS-000001
  title: string;
  description: string;
  severity: STIGSeverity;
  checkContent: string;
  fixContent: string;
  ccis: string[]; // CCI references
}

export type STIGSeverity = "high" | "medium" | "low";

// ============================================
// Audit Types
// ============================================

export interface AuditJob extends BaseEntity {
  name: string;
  targetId: string;
  definitionId: string;
  status: AuditStatus;
  startedAt?: Date;
  completedAt?: Date;
  createdBy?: string;
  errorMessage?: string;
  progress?: number; // 0-100
  totalChecks?: number;
  completedChecks?: number;
}

export type AuditStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface AuditResult extends BaseEntity {
  jobId: string;
  ruleId: string;
  title: string;
  severity: STIGSeverity;
  status: CheckStatus;
  findingDetails?: string;
  comments?: string;
  checkedAt: Date;
}

export type CheckStatus =
  | "pass"
  | "fail"
  | "not_applicable"
  | "not_reviewed"
  | "error";

// ============================================
// Report Types
// ============================================

export type ReportFormat = "pdf" | "html" | "ckl" | "json" | "sarif";

export interface ReportRequest {
  jobId: string;
  format: ReportFormat;
  includeDetails: boolean;
  includeRemediation: boolean;
}

export interface ComplianceSummary {
  jobId: string;
  targetName: string;
  stigTitle: string;
  auditDate: Date;
  totalChecks: number;
  passed: number;
  failed: number;
  notApplicable: number;
  notReviewed: number;
  errors: number;
  complianceScore: number; // percentage
  severityBreakdown: {
    high: { passed: number; failed: number };
    medium: { passed: number; failed: number };
    low: { passed: number; failed: number };
  };
}

// ============================================
// API Schemas
// ============================================

export const CreateTargetSchema = z.object({
  name: z.string().min(1).max(255),
  ipAddress: z.string().ip(),
  platform: z.enum([
    "linux",
    "macos",
    "windows",
    "cisco_ios",
    "cisco_nxos",
    "arista_eos",
    "hp_procurve",
    "mellanox",
    "juniper_srx",
    "juniper_junos",
    "pfsense",
    "paloalto",
    "fortinet",
    "f5_bigip",
    "vmware_esxi",
    "vmware_vcenter",
  ]),
  osVersion: z.string().max(100).optional(),
  connectionType: z.enum(["ssh", "netmiko", "winrm", "api"]),
  credentialId: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
});

export const UpdateTargetSchema = CreateTargetSchema.partial();

export const StartAuditSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  targetId: z.string().uuid(),
  definitionId: z.string().uuid(),
});

export const GenerateReportSchema = z.object({
  jobId: z.string().uuid(),
  format: z.enum(["pdf", "html", "ckl", "json", "sarif"]),
  includeDetails: z.boolean().default(true),
  includeRemediation: z.boolean().default(true),
});

export type CreateTargetInput = z.infer<typeof CreateTargetSchema>;
export type UpdateTargetInput = z.infer<typeof UpdateTargetSchema>;
export type StartAuditInput = z.infer<typeof StartAuditSchema>;
export type GenerateReportInput = z.infer<typeof GenerateReportSchema>;

// ============================================
// Dashboard Types
// ============================================

export interface STIGDashboard {
  totalTargets: number;
  activeTargets: number;
  totalDefinitions: number;
  recentAudits: AuditJob[];
  complianceTrend: {
    date: Date;
    score: number;
  }[];
  worstFindings: {
    ruleId: string;
    title: string;
    severity: STIGSeverity;
    affectedTargets: number;
  }[];
  targetCompliance: {
    target: Target;
    lastScore?: number;
    lastAudit?: Date;
  }[];
}

// ============================================
// CKL (Checklist) Types
// ============================================

export interface CKLData {
  targetData: {
    role: string;
    assetType: string;
    hostname: string;
    ipAddress: string;
    macAddress?: string;
    fqdn?: string;
  };
  stigInfo: {
    title: string;
    version: string;
    releaseDate: string;
  };
  vulns: {
    vulnId: string;
    ruleId: string;
    status: CheckStatus;
    findingDetails?: string;
    comments?: string;
  }[];
}
