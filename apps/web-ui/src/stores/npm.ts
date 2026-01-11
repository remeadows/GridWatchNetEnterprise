import { create } from "zustand";
import type { Device, Alert, NPMDashboard } from "@netnynja/shared-types";
import { api } from "../lib/api";

export interface CreateDeviceInput {
  name: string;
  ipAddress: string;
  deviceType?: string;
  vendor?: string;
  model?: string;
  groupId?: string;
  pollIcmp?: boolean;
  pollSnmp?: boolean;
  snmpv3CredentialId?: string;
  snmpPort?: number;
  sshEnabled?: boolean;
  pollInterval?: number;
  isActive?: boolean;
}

export interface UpdateDeviceInput {
  name?: string;
  ipAddress?: string;
  deviceType?: string;
  vendor?: string;
  model?: string;
  groupId?: string | null;
  pollIcmp?: boolean;
  pollSnmp?: boolean;
  snmpv3CredentialId?: string | null;
  snmpPort?: number;
  sshEnabled?: boolean;
  pollInterval?: number;
  isActive?: boolean;
}

// Discovery types
export interface DiscoveryJob {
  id: string;
  name: string;
  cidr: string;
  discoveryMethod: "icmp" | "snmpv3" | "both";
  snmpv3CredentialId?: string;
  snmpv3CredentialName?: string;
  site?: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progressPercent: number;
  totalHosts: number;
  discoveredHosts: number;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdByUsername?: string;
}

export interface DiscoveredHost {
  id: string;
  jobId: string;
  ipAddress: string;
  hostname?: string;
  macAddress?: string;
  vendor?: string;
  model?: string;
  deviceType?: string;
  sysName?: string;
  sysDescription?: string;
  sysContact?: string;
  sysLocation?: string;
  site?: string;
  icmpReachable: boolean;
  icmpLatencyMs?: number;
  icmpTtl?: number;
  snmpReachable: boolean;
  snmpEngineId?: string;
  interfacesCount: number;
  uptimeSeconds?: number;
  osFamily?: string;
  openPorts?: string;
  fingerprintConfidence?: "low" | "medium" | "high";
  isAddedToMonitoring: boolean;
  deviceId?: string;
  discoveredAt: string;
}

export interface StartDiscoveryInput {
  name: string;
  cidr: string;
  discoveryMethod: "icmp" | "snmpv3" | "both";
  snmpv3CredentialId?: string;
  site?: string;
}

// Site info type
export interface SiteInfo {
  site: string | null;
  count: number;
}

export interface AddHostsInput {
  hostIds: string[];
  pollIcmp?: boolean;
  pollSnmp?: boolean;
  snmpv3CredentialId?: string;
  pollInterval?: number;
}

// Poll device types
export interface PollDeviceInput {
  methods: ("icmp" | "snmp")[];
}

export interface PollResult {
  icmp?: {
    success: boolean;
    latencyMs?: number;
    error?: string;
  };
  snmp?: {
    success: boolean;
    cpuPercent?: number;
    memoryPercent?: number;
    uptimeSeconds?: number;
    error?: string;
  };
}

export interface PollDeviceResponse {
  deviceId: string;
  deviceName: string;
  ipAddress: string;
  polledAt: string;
  methods: ("icmp" | "snmp")[];
  results: PollResult;
  deviceStatus: {
    status: string;
    icmpStatus: string;
    snmpStatus: string;
    lastPoll: string;
    lastIcmpPoll: string | null;
    lastSnmpPoll: string | null;
  };
}

// Background poller status
export interface PollerStatus {
  isRunning: boolean;
  activePolls: number;
  pollCycleCount: number;
  config: {
    enabled: boolean;
    defaultIntervalMs: number;
    maxConcurrentPolls: number;
    batchSize: number;
  };
}

// Device metrics types
export interface DeviceMetricsPoint {
  timestamp: string;
  latencyMs: number | null;
  packetLossPercent: number | null;
  icmpReachable: boolean | null;
  cpuPercent: number | null;
  memoryPercent: number | null;
  memoryTotalBytes: number | null;
  memoryUsedBytes: number | null;
  uptimeSeconds: number | null;
  totalInterfaces: number | null;
  interfacesUp: number | null;
  interfacesDown: number | null;
  isAvailable: boolean;
}

export interface CurrentDeviceMetrics {
  collectedAt: string;
  latencyMs: number | null;
  packetLossPercent: number | null;
  cpuPercent: number | null;
  memoryPercent: number | null;
  memoryTotalBytes: number | null;
  memoryUsedBytes: number | null;
  temperatureCelsius: number | null;
  uptimeSeconds: number | null;
  uptimeFormatted: string | null;
  totalInterfaces: number | null;
  interfacesUp: number | null;
  interfacesDown: number | null;
  isAvailable: boolean;
}

export interface Last24HoursStats {
  availabilityPercent: number | null;
  totalPolls: number;
  successfulPolls: number;
  avgLatencyMs: number | null;
  minLatencyMs: number | null;
  maxLatencyMs: number | null;
  avgCpuPercent: number | null;
  maxCpuPercent: number | null;
  avgMemoryPercent: number | null;
  maxMemoryPercent: number | null;
}

export interface DeviceMetricsResponse {
  deviceId: string;
  deviceName: string;
  ipAddress: string;
  deviceType: string | null;
  vendor: string | null;
  model: string | null;
  status: string;
  icmpStatus: string;
  snmpStatus: string;
  lastPoll: string | null;
  pollMethods: {
    icmp: boolean;
    snmp: boolean;
  };
  current: CurrentDeviceMetrics | null;
  last24Hours: Last24HoursStats;
}

export interface DeviceMetricsHistoryResponse {
  deviceId: string;
  deviceName: string;
  startTime: string;
  endTime: string;
  pointCount: number;
  metrics: DeviceMetricsPoint[];
}

interface NPMState {
  devices: Device[];
  selectedDevice: Device | null;
  alerts: Alert[];
  dashboard: NPMDashboard | null;
  // Discovery state
  discoveryJobs: DiscoveryJob[];
  selectedJob: DiscoveryJob | null;
  discoveredHosts: DiscoveredHost[];
  jobSites: SiteInfo[];
  // Metrics state
  currentMetrics: DeviceMetricsResponse | null;
  metricsHistory: DeviceMetricsHistoryResponse | null;
  // Poller state
  pollerStatus: PollerStatus | null;
  isLoading: boolean;
  error: string | null;

  fetchDevices: () => Promise<void>;
  fetchDevice: (id: string) => Promise<void>;
  fetchAlerts: () => Promise<void>;
  createDevice: (data: CreateDeviceInput) => Promise<Device>;
  updateDevice: (id: string, data: UpdateDeviceInput) => Promise<Device>;
  deleteDevice: (id: string) => Promise<void>;
  acknowledgeAlert: (alertId: string) => Promise<void>;
  fetchDashboard: () => Promise<void>;
  // Discovery actions
  fetchDiscoveryJobs: () => Promise<void>;
  fetchDiscoveryJob: (id: string) => Promise<void>;
  startDiscovery: (data: StartDiscoveryInput) => Promise<DiscoveryJob>;
  cancelDiscoveryJob: (id: string) => Promise<void>;
  deleteDiscoveryJob: (id: string) => Promise<void>;
  fetchDiscoveredHosts: (jobId: string) => Promise<void>;
  addHostsToMonitoring: (
    jobId: string,
    data: AddHostsInput,
  ) => Promise<{ addedCount: number }>;
  fetchJobSites: (jobId: string) => Promise<void>;
  updateHostsSite: (
    jobId: string,
    hostIds: string[],
    site: string | null,
  ) => Promise<{ updatedCount: number }>;
  // Metrics actions
  fetchCurrentMetrics: (deviceId: string) => Promise<void>;
  fetchMetricsHistory: (
    deviceId: string,
    startTime?: Date,
    endTime?: Date,
  ) => Promise<void>;
  // Poll device action
  pollDevice: (
    deviceId: string,
    methods: ("icmp" | "snmp")[],
  ) => Promise<PollDeviceResponse>;
  // Poller status actions
  fetchPollerStatus: () => Promise<void>;
  // Poll all devices
  pollAllDevices: () => Promise<{
    polled: number;
    succeeded: number;
    failed: number;
  }>;
}

export const useNPMStore = create<NPMState>((set) => ({
  devices: [],
  selectedDevice: null,
  alerts: [],
  dashboard: null,
  discoveryJobs: [],
  selectedJob: null,
  discoveredHosts: [],
  jobSites: [],
  currentMetrics: null,
  metricsHistory: null,
  pollerStatus: null,
  isLoading: false,
  error: null,

  fetchDevices: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: Device[] }>("/api/v1/npm/devices");
      set({ devices: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch devices";
      set({ error: message, isLoading: false });
    }
  },

  fetchDevice: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: Device }>(
        `/api/v1/npm/devices/${id}`,
      );
      set({ selectedDevice: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch device";
      set({ error: message, isLoading: false });
    }
  },

  fetchAlerts: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: Alert[] }>("/api/v1/npm/alerts");
      set({ alerts: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch alerts";
      set({ error: message, isLoading: false });
    }
  },

  createDevice: async (data: CreateDeviceInput) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{ data: Device }>(
        "/api/v1/npm/devices",
        data,
      );
      const device = response.data.data;
      set((state) => ({
        devices: [...state.devices, device],
        isLoading: false,
      }));
      return device;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create device";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  updateDevice: async (id: string, data: UpdateDeviceInput) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.patch<{ data: Device }>(
        `/api/v1/npm/devices/${id}`,
        data,
      );
      const device = response.data.data;
      set((state) => ({
        devices: state.devices.map((d) => (d.id === id ? device : d)),
        selectedDevice:
          state.selectedDevice?.id === id ? device : state.selectedDevice,
        isLoading: false,
      }));
      return device;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update device";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  deleteDevice: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/api/v1/npm/devices/${id}`);
      set((state) => ({
        devices: state.devices.filter((d) => d.id !== id),
        selectedDevice:
          state.selectedDevice?.id === id ? null : state.selectedDevice,
        isLoading: false,
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete device";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  acknowledgeAlert: async (alertId: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.post(`/api/v1/npm/alerts/${alertId}/acknowledge`);
      set((state) => ({
        alerts: state.alerts.map((a) =>
          a.id === alertId
            ? {
                ...a,
                status: "acknowledged" as const,
                acknowledgedAt: new Date(),
              }
            : a,
        ),
        isLoading: false,
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to acknowledge alert";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  fetchDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: NPMDashboard }>(
        "/api/v1/npm/dashboard",
      );
      set({ dashboard: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch dashboard";
      set({ error: message, isLoading: false });
    }
  },

  // Discovery actions
  fetchDiscoveryJobs: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: DiscoveryJob[] }>(
        "/api/v1/npm/discovery/jobs",
      );
      set({ discoveryJobs: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch discovery jobs";
      set({ error: message, isLoading: false });
    }
  },

  fetchDiscoveryJob: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: DiscoveryJob }>(
        `/api/v1/npm/discovery/jobs/${id}`,
      );
      set({ selectedJob: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch discovery job";
      set({ error: message, isLoading: false });
    }
  },

  startDiscovery: async (data: StartDiscoveryInput) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{ data: DiscoveryJob }>(
        "/api/v1/npm/discovery/jobs",
        data,
      );
      const job = response.data.data;
      set((state) => ({
        discoveryJobs: [job, ...state.discoveryJobs],
        isLoading: false,
      }));
      return job;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start discovery";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  cancelDiscoveryJob: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.post(`/api/v1/npm/discovery/jobs/${id}/cancel`);
      set((state) => ({
        discoveryJobs: state.discoveryJobs.map((j) =>
          j.id === id ? { ...j, status: "cancelled" as const } : j,
        ),
        selectedJob:
          state.selectedJob?.id === id
            ? { ...state.selectedJob, status: "cancelled" as const }
            : state.selectedJob,
        isLoading: false,
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to cancel discovery job";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  deleteDiscoveryJob: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/api/v1/npm/discovery/jobs/${id}`);
      set((state) => ({
        discoveryJobs: state.discoveryJobs.filter((j) => j.id !== id),
        selectedJob: state.selectedJob?.id === id ? null : state.selectedJob,
        isLoading: false,
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete discovery job";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  fetchDiscoveredHosts: async (jobId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: DiscoveredHost[] }>(
        `/api/v1/npm/discovery/jobs/${jobId}/hosts`,
      );
      set({ discoveredHosts: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch discovered hosts";
      set({ error: message, isLoading: false });
    }
  },

  addHostsToMonitoring: async (jobId: string, data: AddHostsInput) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{ data: { addedCount: number } }>(
        `/api/v1/npm/discovery/jobs/${jobId}/hosts/add`,
        data,
      );
      // Mark hosts as added in state
      set((state) => ({
        discoveredHosts: state.discoveredHosts.map((h) =>
          data.hostIds.includes(h.id) ? { ...h, isAddedToMonitoring: true } : h,
        ),
        isLoading: false,
      }));
      return response.data.data;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to add hosts to monitoring";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  fetchJobSites: async (jobId: string) => {
    try {
      const response = await api.get<{ data: SiteInfo[] }>(
        `/api/v1/npm/discovery/jobs/${jobId}/sites`,
      );
      set({ jobSites: response.data.data });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch job sites";
      set({ error: message });
    }
  },

  updateHostsSite: async (
    jobId: string,
    hostIds: string[],
    site: string | null,
  ) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.patch<{
        data: { updatedCount: number; site: string | null };
      }>(`/api/v1/npm/discovery/jobs/${jobId}/hosts/site`, { hostIds, site });
      // Update hosts site in state
      set((state) => ({
        discoveredHosts: state.discoveredHosts.map((h) =>
          hostIds.includes(h.id) ? { ...h, site: site ?? undefined } : h,
        ),
        isLoading: false,
      }));
      return response.data.data;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update hosts site";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  // Metrics actions
  fetchCurrentMetrics: async (deviceId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: DeviceMetricsResponse }>(
        `/api/v1/npm/devices/${deviceId}/metrics/current`,
      );
      set({ currentMetrics: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch device metrics";
      set({ error: message, isLoading: false });
    }
  },

  fetchMetricsHistory: async (
    deviceId: string,
    startTime?: Date,
    endTime?: Date,
  ) => {
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (startTime) {
        params.append("startTime", startTime.toISOString());
      }
      if (endTime) {
        params.append("endTime", endTime.toISOString());
      }
      const queryString = params.toString();
      const url = `/api/v1/npm/devices/${deviceId}/metrics${queryString ? `?${queryString}` : ""}`;

      const response = await api.get<{ data: DeviceMetricsHistoryResponse }>(
        url,
      );
      set({ metricsHistory: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch metrics history";
      set({ error: message, isLoading: false });
    }
  },

  // Poll device now
  pollDevice: async (deviceId: string, methods: ("icmp" | "snmp")[]) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{ data: PollDeviceResponse }>(
        `/api/v1/npm/devices/${deviceId}/poll`,
        { methods },
      );
      const pollResult = response.data.data;

      // Update device status in state
      set((state) => ({
        devices: state.devices.map((d) =>
          d.id === deviceId
            ? {
                ...d,
                status: pollResult.deviceStatus.status as
                  | "up"
                  | "down"
                  | "warning"
                  | "unknown",
                lastPoll: new Date(pollResult.deviceStatus.lastPoll),
              }
            : d,
        ),
        selectedDevice:
          state.selectedDevice?.id === deviceId
            ? {
                ...state.selectedDevice,
                status: pollResult.deviceStatus.status as
                  | "up"
                  | "down"
                  | "warning"
                  | "unknown",
                lastPoll: new Date(pollResult.deviceStatus.lastPoll),
              }
            : state.selectedDevice,
        isLoading: false,
      }));

      return pollResult;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to poll device";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  // Fetch background poller status
  fetchPollerStatus: async () => {
    try {
      const response = await api.get<{ data: PollerStatus }>(
        "/api/v1/npm/poller/status",
      );
      set({ pollerStatus: response.data.data });
    } catch (err) {
      // Silently fail - poller status is non-critical
      console.warn("Failed to fetch poller status:", err);
    }
  },

  // Poll all devices
  pollAllDevices: async (): Promise<{
    polled: number;
    succeeded: number;
    failed: number;
  }> => {
    const state = useNPMStore.getState();
    const devicesToPoll = state.devices.filter((d: Device) => d.isActive);

    if (devicesToPoll.length === 0)
      return { polled: 0, succeeded: 0, failed: 0 };

    set({ isLoading: true, error: null });

    let succeeded = 0;
    let failed = 0;

    // Poll devices in parallel with concurrency limit of 10
    const concurrencyLimit = 10;
    const chunks: Device[][] = [];
    for (let i = 0; i < devicesToPoll.length; i += concurrencyLimit) {
      chunks.push(devicesToPoll.slice(i, i + concurrencyLimit));
    }

    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map(async (device) => {
          const methods: ("icmp" | "snmp")[] = [];
          if (device.pollIcmp) methods.push("icmp");
          if (device.pollSnmp) methods.push("snmp");
          if (methods.length === 0) methods.push("icmp"); // Default to ICMP

          const response = await api.post<{ data: PollDeviceResponse }>(
            `/api/v1/npm/devices/${device.id}/poll`,
            { methods },
          );
          return { deviceId: device.id, result: response.data.data };
        }),
      );

      // Update device states based on results
      const updates: { id: string; status: string; lastPoll: Date }[] = [];

      for (const result of results) {
        if (result.status === "fulfilled") {
          succeeded++;
          updates.push({
            id: result.value.deviceId,
            status: result.value.result.deviceStatus.status,
            lastPoll: new Date(result.value.result.deviceStatus.lastPoll),
          });
        } else {
          failed++;
        }
      }

      // Batch update state
      set((state) => ({
        devices: state.devices.map((d) => {
          const update = updates.find((u) => u.id === d.id);
          if (update) {
            return {
              ...d,
              status: update.status as "up" | "down" | "warning" | "unknown",
              lastPoll: update.lastPoll,
            };
          }
          return d;
        }),
      }));
    }

    set({ isLoading: false });
    return { polled: devicesToPoll.length, succeeded, failed };
  },
}));
