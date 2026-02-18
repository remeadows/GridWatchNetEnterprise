/**
 * GridWatch IPAM - Type Definitions
 */

import { z } from "zod";
import type { BaseEntity } from "./index";

// ============================================
// Network Types
// ============================================

export interface Network extends BaseEntity {
  name: string;
  network: string; // CIDR notation e.g., "192.168.1.0/24"
  vlanId?: number;
  description?: string;
  location?: string;
  site?: string;
  gateway?: string;
  dnsServers?: string[];
  isActive: boolean;
  createdBy?: string;
}

export interface IPAddress extends BaseEntity {
  networkId: string;
  address: string;
  macAddress?: string;
  hostname?: string;
  fqdn?: string;
  status: IPStatus;
  deviceType?: string;
  description?: string;
  responseTimeMs?: number; // Ping/TCP response latency in milliseconds
  openPorts?: string; // Comma-separated list of open TCP ports
  lastSeen?: Date;
  discoveredAt?: Date;
}

export type IPStatus = "active" | "inactive" | "reserved" | "dhcp" | "unknown";

// ============================================
// Scanning Types
// ============================================

export interface ScanJob extends BaseEntity {
  networkId: string;
  scanType: ScanType;
  name?: string;
  notes?: string;
  startedAt: Date;
  completedAt?: Date;
  totalIps: number;
  activeIps: number;
  newIps: number;
  status: ScanStatus;
  errorMessage?: string;
}

export type ScanType = "ping" | "tcp" | "nmap" | "arp";
export type ScanStatus = "pending" | "running" | "completed" | "failed";

export interface ScanResult {
  address: string;
  isAlive: boolean;
  responseTime?: number;
  macAddress?: string;
  hostname?: string;
  openPorts?: number[];
  osGuess?: string;
}

// ============================================
// API Schemas
// ============================================

export const CreateNetworkSchema = z.object({
  name: z.string().min(1).max(255),
  network: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/),
  vlanId: z.number().int().min(1).max(4094).optional(),
  description: z.string().max(1000).optional(),
  location: z.string().max(255).optional(),
  site: z.string().max(255).optional(),
  gateway: z.string().ip().optional(),
  dnsServers: z.array(z.string().ip()).optional(),
  isActive: z.boolean().optional(),
});

export const UpdateNetworkSchema = CreateNetworkSchema.partial();

export const StartScanSchema = z.object({
  networkId: z.string().uuid(),
  scanType: z.enum(["ping", "tcp", "nmap", "arp"]).default("ping"),
});

export type CreateNetworkInput = z.infer<typeof CreateNetworkSchema>;
export type UpdateNetworkInput = z.infer<typeof UpdateNetworkSchema>;
export type StartScanInput = z.infer<typeof StartScanSchema>;

// ============================================
// Statistics
// ============================================

export interface NetworkStats {
  networkId: string;
  totalAddresses: number;
  usedAddresses: number;
  availableAddresses: number;
  utilizationPercent: number;
  activeDevices: number;
  lastScanAt?: Date;
}

export interface IPAMDashboard {
  totalNetworks: number;
  totalAddresses: number;
  activeDevices: number;
  recentScans: ScanJob[];
  topNetworks: NetworkStats[];
}
