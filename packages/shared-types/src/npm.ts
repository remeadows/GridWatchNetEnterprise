/**
 * NetNynja NPM - Type Definitions
 */

import { z } from 'zod';
import type { BaseEntity } from './index';

// ============================================
// Device Types
// ============================================

export interface Device extends BaseEntity {
  name: string;
  ipAddress: string;
  deviceType?: string;
  vendor?: string;
  model?: string;
  snmpVersion: SNMPVersion;
  sshEnabled: boolean;
  pollInterval: number; // seconds
  isActive: boolean;
  lastPoll?: Date;
  status: DeviceStatus;
}

export type SNMPVersion = 'v1' | 'v2c' | 'v3';
export type DeviceStatus = 'up' | 'down' | 'warning' | 'unknown';

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

export type InterfaceStatus = 'up' | 'down' | 'testing' | 'unknown';

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
  | 'interface_utilization'
  | 'interface_errors'
  | 'cpu_utilization'
  | 'memory_utilization'
  | 'device_down'
  | 'interface_down';

export type AlertCondition = 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
export type AlertSeverity = 'info' | 'warning' | 'critical';

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

export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

// ============================================
// API Schemas
// ============================================

export const CreateDeviceSchema = z.object({
  name: z.string().min(1).max(255),
  ipAddress: z.string().ip(),
  deviceType: z.string().max(100).optional(),
  vendor: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  snmpVersion: z.enum(['v1', 'v2c', 'v3']).default('v2c'),
  snmpCommunity: z.string().max(100).optional(),
  sshEnabled: z.boolean().default(false),
  pollInterval: z.number().int().min(10).max(3600).default(60),
});

export const UpdateDeviceSchema = CreateDeviceSchema.partial();

export const CreateAlertRuleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  metricType: z.enum([
    'interface_utilization',
    'interface_errors',
    'cpu_utilization',
    'memory_utilization',
    'device_down',
    'interface_down',
  ]),
  condition: z.enum(['gt', 'lt', 'eq', 'gte', 'lte']),
  threshold: z.number(),
  durationSeconds: z.number().int().min(0).default(60),
  severity: z.enum(['info', 'warning', 'critical']).default('warning'),
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
  type: 'device' | 'interface';
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
