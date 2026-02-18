/**
 * GridWatch NPM - Type Definitions
 */

import { z } from "zod";
import type { BaseEntity } from "./index";

// ============================================
// SNMPv3 Credentials Types (FIPS-compliant only)
// ============================================

export type SNMPv3SecurityLevel = "noAuthNoPriv" | "authNoPriv" | "authPriv";
export type SNMPv3AuthProtocol =
  | "SHA"
  | "SHA-224"
  | "SHA-256"
  | "SHA-384"
  | "SHA-512";
export type SNMPv3PrivProtocol = "AES" | "AES-192" | "AES-256";

export interface SNMPv3Credential extends BaseEntity {
  name: string;
  description?: string;
  username: string;
  securityLevel: SNMPv3SecurityLevel;
  authProtocol?: SNMPv3AuthProtocol;
  privProtocol?: SNMPv3PrivProtocol;
  contextName?: string;
  contextEngineId?: string;
  createdBy?: string;
  // Note: passwords are never returned from API
}

// ============================================
// Device Types
// ============================================

export interface Device extends BaseEntity {
  name: string;
  ipAddress: string;
  deviceType?: string;
  vendor?: string;
  model?: string;
  // Group association
  groupId?: string;
  groupName?: string;
  groupColor?: string;
  // Polling methods
  pollIcmp: boolean;
  pollSnmp: boolean;
  snmpv3CredentialId?: string;
  snmpv3CredentialName?: string; // For display purposes
  snmpPort: number;
  sshEnabled: boolean;
  pollInterval: number; // seconds
  isActive: boolean;
  lastPoll?: Date;
  lastIcmpPoll?: Date;
  lastSnmpPoll?: Date;
  status: DeviceStatus;
  icmpStatus: DeviceStatus;
  snmpStatus: DeviceStatus;
}

export type DeviceStatus = "up" | "down" | "warning" | "unknown";

// ============================================
// Interface Types
// ============================================

export interface NetworkInterface extends BaseEntity {
  deviceId: string;
  ifIndex: number;
  name: string;
  description?: string;
  macAddress?: string;
  ipAddresses?: string[];
  speedMbps?: number;
  adminStatus: InterfaceStatus;
  operStatus: InterfaceStatus;
  isMonitored: boolean;
}

export type InterfaceStatus = "up" | "down" | "testing" | "unknown";

// ============================================
// Metrics Types
// ============================================

export interface InterfaceMetrics {
  deviceId: string;
  interfaceId: string;
  timestamp: Date;
  inOctets: number;
  outOctets: number;
  inErrors: number;
  outErrors: number;
  inDiscards: number;
  outDiscards: number;
  utilization: number; // percentage
}

export interface DeviceMetrics {
  deviceId: string;
  timestamp: Date;
  cpuUtilization?: number;
  memoryUtilization?: number;
  uptimeSeconds?: number;
  temperature?: number;
}

// ============================================
// Alert Types
// ============================================

export interface AlertRule extends BaseEntity {
  name: string;
  description?: string;
  metricType: MetricType;
  condition: AlertCondition;
  threshold: number;
  durationSeconds: number;
  severity: AlertSeverity;
  isActive: boolean;
  createdBy?: string;
}

export type MetricType =
  | "interface_utilization"
  | "interface_errors"
  | "cpu_utilization"
  | "memory_utilization"
  | "device_down"
  | "interface_down";

export type AlertCondition = "gt" | "lt" | "eq" | "gte" | "lte";
export type AlertSeverity = "info" | "warning" | "critical";

export interface Alert extends BaseEntity {
  ruleId?: string;
  deviceId?: string;
  interfaceId?: string;
  message: string;
  severity: AlertSeverity;
  status: AlertStatus;
  triggeredAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  details?: Record<string, unknown>;
}

export type AlertStatus = "active" | "acknowledged" | "resolved";

// ============================================
// API Schemas
// ============================================

// SNMPv3 Credential Schemas
export const CreateSNMPv3CredentialSchema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    username: z.string().min(1).max(255),
    securityLevel: z
      .enum(["noAuthNoPriv", "authNoPriv", "authPriv"])
      .default("authPriv"),
    authProtocol: z
      .enum(["SHA", "SHA-224", "SHA-256", "SHA-384", "SHA-512"])
      .optional(),
    authPassword: z.string().min(8).max(255).optional(),
    privProtocol: z.enum(["AES", "AES-192", "AES-256"]).optional(),
    privPassword: z.string().min(8).max(255).optional(),
    contextName: z.string().max(255).optional(),
    contextEngineId: z.string().max(255).optional(),
  })
  .refine(
    (data) => {
      // If authNoPriv or authPriv, auth fields are required
      if (
        data.securityLevel === "authNoPriv" ||
        data.securityLevel === "authPriv"
      ) {
        return data.authProtocol && data.authPassword;
      }
      return true;
    },
    {
      message:
        "Authentication protocol and password required for authNoPriv/authPriv security levels",
    },
  )
  .refine(
    (data) => {
      // If authPriv, priv fields are required
      if (data.securityLevel === "authPriv") {
        return data.privProtocol && data.privPassword;
      }
      return true;
    },
    {
      message:
        "Privacy protocol and password required for authPriv security level",
    },
  );

export const UpdateSNMPv3CredentialSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  username: z.string().min(1).max(255).optional(),
  securityLevel: z.enum(["noAuthNoPriv", "authNoPriv", "authPriv"]).optional(),
  authProtocol: z
    .enum(["SHA", "SHA-224", "SHA-256", "SHA-384", "SHA-512"])
    .optional(),
  authPassword: z.string().min(8).max(255).optional(),
  privProtocol: z.enum(["AES", "AES-192", "AES-256"]).optional(),
  privPassword: z.string().min(8).max(255).optional(),
  contextName: z.string().max(255).optional(),
  contextEngineId: z.string().max(255).optional(),
});

export const TestSNMPv3CredentialSchema = z.object({
  targetIp: z.string().ip(),
  port: z.number().int().min(1).max(65535).default(161),
});

export type CreateSNMPv3CredentialInput = z.infer<
  typeof CreateSNMPv3CredentialSchema
>;
export type UpdateSNMPv3CredentialInput = z.infer<
  typeof UpdateSNMPv3CredentialSchema
>;
export type TestSNMPv3CredentialInput = z.infer<
  typeof TestSNMPv3CredentialSchema
>;

// Device Schemas
export const CreateDeviceSchema = z
  .object({
    name: z.string().min(1).max(255),
    ipAddress: z.string().ip(),
    deviceType: z.string().max(100).optional(),
    vendor: z.string().max(100).optional(),
    model: z.string().max(100).optional(),
    groupId: z.string().uuid().optional(),
    pollIcmp: z.boolean().default(true),
    pollSnmp: z.boolean().default(false),
    snmpv3CredentialId: z.string().uuid().optional(),
    snmpPort: z.number().int().min(1).max(65535).default(161),
    sshEnabled: z.boolean().default(false),
    pollInterval: z.number().int().min(10).max(3600).default(60),
  })
  .refine((data) => data.pollIcmp || data.pollSnmp, {
    message: "At least one polling method (ICMP or SNMP) must be enabled",
  })
  .refine(
    (data) => {
      // If SNMP polling is enabled, credential must be provided
      if (data.pollSnmp) {
        return !!data.snmpv3CredentialId;
      }
      return true;
    },
    { message: "SNMPv3 credential is required when SNMP polling is enabled" },
  );

export const UpdateDeviceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  ipAddress: z.string().ip().optional(),
  deviceType: z.string().max(100).optional(),
  vendor: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  groupId: z.string().uuid().nullable().optional(),
  pollIcmp: z.boolean().optional(),
  pollSnmp: z.boolean().optional(),
  snmpv3CredentialId: z.string().uuid().nullable().optional(),
  snmpPort: z.number().int().min(1).max(65535).optional(),
  sshEnabled: z.boolean().optional(),
  pollInterval: z.number().int().min(10).max(3600).optional(),
  isActive: z.boolean().optional(),
});

export const CreateAlertRuleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  metricType: z.enum([
    "interface_utilization",
    "interface_errors",
    "cpu_utilization",
    "memory_utilization",
    "device_down",
    "interface_down",
  ]),
  condition: z.enum(["gt", "lt", "eq", "gte", "lte"]),
  threshold: z.number(),
  durationSeconds: z.number().int().min(0).default(60),
  severity: z.enum(["info", "warning", "critical"]).default("warning"),
});

export type CreateDeviceInput = z.infer<typeof CreateDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof UpdateDeviceSchema>;
export type CreateAlertRuleInput = z.infer<typeof CreateAlertRuleSchema>;

// ============================================
// Dashboard Types
// ============================================

export interface NPMDashboard {
  totalDevices: number;
  devicesUp: number;
  devicesDown: number;
  devicesWarning: number;
  totalInterfaces: number;
  activeAlerts: Alert[];
  topUtilization: {
    device: Device;
    interface: NetworkInterface;
    utilization: number;
  }[];
  recentEvents: Alert[];
}

export interface TopologyNode {
  id: string;
  type: "device" | "interface";
  label: string;
  status: DeviceStatus | InterfaceStatus;
  x?: number;
  y?: number;
  data: Device | NetworkInterface;
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface TopologyData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}
