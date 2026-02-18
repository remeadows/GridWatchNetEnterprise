import { create } from "zustand";
import type {
  Network,
  IPAddress,
  ScanJob,
  IPAMDashboard,
} from "@gridwatch/shared-types";
import { api } from "../lib/api";

// Response type for adding addresses to NPM
export interface AddToNpmResponse {
  addedCount: number;
  skippedCount: number;
  message?: string;
  addedDevices?: Array<{
    id: string;
    name: string;
    ipAddress: string;
  }>;
}

// Input type for adding addresses to NPM
export interface AddToNpmInput {
  addressIds: string[];
  pollIcmp?: boolean;
  pollSnmp?: boolean;
  snmpv3CredentialId?: string;
  pollInterval?: number;
}

interface IPAMState {
  networks: Network[];
  selectedNetwork: Network | null;
  addresses: IPAddress[];
  scanJobs: ScanJob[];
  currentScan: ScanJob | null;
  dashboard: IPAMDashboard | null;
  isLoading: boolean;
  isAddingToNpm: boolean;
  error: string | null;

  fetchNetworks: () => Promise<void>;
  fetchNetwork: (id: string) => Promise<void>;
  fetchAddresses: (networkId: string) => Promise<void>;
  createNetwork: (data: Partial<Network>) => Promise<Network>;
  updateNetwork: (id: string, data: Partial<Network>) => Promise<Network>;
  deleteNetwork: (id: string) => Promise<void>;
  startScan: (networkId: string, scanTypes: string[]) => Promise<ScanJob>;
  fetchScanHistory: (networkId: string) => Promise<void>;
  fetchScanStatus: (scanId: string) => Promise<void>;
  deleteScan: (scanId: string) => Promise<void>;
  updateScan: (
    scanId: string,
    data: { name?: string; notes?: string },
  ) => Promise<ScanJob>;
  exportScan: (scanId: string, format: "pdf" | "csv") => Promise<void>;
  exportNetwork: (networkId: string, format: "pdf" | "csv") => Promise<void>;
  fetchDashboard: () => Promise<void>;
  addAddressesToNpm: (data: AddToNpmInput) => Promise<AddToNpmResponse>;
}

export const useIPAMStore = create<IPAMState>((set) => ({
  networks: [],
  selectedNetwork: null,
  addresses: [],
  scanJobs: [],
  currentScan: null,
  dashboard: null,
  isLoading: false,
  isAddingToNpm: false,
  error: null,

  fetchNetworks: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: Network[] }>(
        "/api/v1/ipam/networks",
      );
      set({ networks: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch networks";
      set({ error: message, isLoading: false });
    }
  },

  fetchNetwork: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: Network }>(
        `/api/v1/ipam/networks/${id}`,
      );
      set({ selectedNetwork: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch network";
      set({ error: message, isLoading: false });
    }
  },

  fetchAddresses: async (networkId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: IPAddress[] }>(
        `/api/v1/ipam/networks/${networkId}/addresses`,
      );
      set({ addresses: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch addresses";
      set({ error: message, isLoading: false });
    }
  },

  createNetwork: async (data: Partial<Network>) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{ data: Network }>(
        "/api/v1/ipam/networks",
        data,
      );
      const network = response.data.data;
      set((state) => ({
        networks: [...state.networks, network],
        isLoading: false,
      }));
      return network;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create network";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  updateNetwork: async (id: string, data: Partial<Network>) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.put<{ data: Network }>(
        `/api/v1/ipam/networks/${id}`,
        data,
      );
      const network = response.data.data;
      set((state) => ({
        networks: state.networks.map((n) => (n.id === id ? network : n)),
        selectedNetwork:
          state.selectedNetwork?.id === id ? network : state.selectedNetwork,
        isLoading: false,
      }));
      return network;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update network";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  deleteNetwork: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/api/v1/ipam/networks/${id}`);
      set((state) => ({
        networks: state.networks.filter((n) => n.id !== id),
        selectedNetwork:
          state.selectedNetwork?.id === id ? null : state.selectedNetwork,
        isLoading: false,
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete network";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  startScan: async (networkId: string, scanTypes: string[]) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{ data: ScanJob }>(
        `/api/v1/ipam/networks/${networkId}/scan`,
        {
          scanTypes,
        },
      );
      const scanJob = response.data.data;
      set((state) => ({
        scanJobs: [scanJob, ...state.scanJobs],
        currentScan: scanJob,
        isLoading: false,
      }));
      return scanJob;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start scan";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  fetchScanHistory: async (networkId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: ScanJob[] }>(
        `/api/v1/ipam/networks/${networkId}/scans`,
      );
      set({ scanJobs: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch scan history";
      set({ error: message, isLoading: false });
    }
  },

  fetchScanStatus: async (scanId: string) => {
    try {
      const response = await api.get<{ data: ScanJob }>(
        `/api/v1/ipam/scans/${scanId}`,
      );
      const scan = response.data.data;
      set((state) => ({
        currentScan: scan,
        scanJobs: state.scanJobs.map((s) => (s.id === scanId ? scan : s)),
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch scan status";
      set({ error: message });
    }
  },

  deleteScan: async (scanId: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/api/v1/ipam/scans/${scanId}`);
      set((state) => ({
        scanJobs: state.scanJobs.filter((s) => s.id !== scanId),
        currentScan:
          state.currentScan?.id === scanId ? null : state.currentScan,
        isLoading: false,
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete scan";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  updateScan: async (
    scanId: string,
    data: { name?: string; notes?: string },
  ) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.patch<{ data: ScanJob }>(
        `/api/v1/ipam/scans/${scanId}`,
        data,
      );
      const updatedScan = response.data.data;
      set((state) => ({
        scanJobs: state.scanJobs.map((s) =>
          s.id === scanId ? updatedScan : s,
        ),
        currentScan:
          state.currentScan?.id === scanId ? updatedScan : state.currentScan,
        isLoading: false,
      }));
      return updatedScan;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update scan";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  exportScan: async (scanId: string, format: "pdf" | "csv") => {
    try {
      const response = await api.get(
        `/api/v1/ipam/scans/${scanId}/export?format=${format}`,
        { responseType: "blob" },
      );
      // Create download link
      const blob = new Blob([response.data], {
        type: format === "pdf" ? "application/pdf" : "text/csv",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scan-report.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to export scan";
      set({ error: message });
      throw err;
    }
  },

  exportNetwork: async (networkId: string, format: "pdf" | "csv") => {
    try {
      const response = await api.get(
        `/api/v1/ipam/networks/${networkId}/export?format=${format}`,
        { responseType: "blob" },
      );
      // Create download link
      const blob = new Blob([response.data], {
        type: format === "pdf" ? "application/pdf" : "text/csv",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `network-report.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to export network";
      set({ error: message });
      throw err;
    }
  },

  fetchDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: IPAMDashboard }>(
        "/api/v1/ipam/dashboard",
      );
      set({ dashboard: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch dashboard";
      set({ error: message, isLoading: false });
    }
  },

  addAddressesToNpm: async (data: AddToNpmInput) => {
    set({ isAddingToNpm: true, error: null });
    try {
      const response = await api.post<{ data: AddToNpmResponse }>(
        "/api/v1/ipam/addresses/add-to-npm",
        data,
      );
      set({ isAddingToNpm: false });
      return response.data.data;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add addresses to NPM";
      set({ error: message, isAddingToNpm: false });
      throw err;
    }
  },
}));
