import { create } from "zustand";
import type {
  Target,
  STIGDefinition,
  AuditJob,
  ComplianceSummary,
  STIGDashboard,
} from "@netnynja/shared-types";
import { api } from "../lib/api";

// Library rule type
export interface STIGRule {
  id: string;
  ruleId: string;
  title: string;
  severity: "high" | "medium" | "low";
  description: string;
  fixText: string;
  checkText: string;
}

// Upload response type
export interface STIGUploadResponse {
  id: string;
  stigId: string;
  title: string;
  version: string;
  platform: string;
  rulesCount: number;
}

// Checklist import response type
export interface ChecklistImportResponse {
  auditJobId: string;
  targetId: string;
  targetHostname: string;
  definitionId: string;
  stigId: string;
  resultsCount: number;
  source: string;
}

// Import history entry type
export interface ImportHistoryEntry {
  id: string;
  targetHostname: string;
  stigId: string;
  stigTitle: string;
  resultsCount: number;
  source: string;
  importedAt: string;
  status: string;
}

interface STIGState {
  targets: Target[];
  selectedTarget: Target | null;
  benchmarks: STIGDefinition[];
  selectedBenchmarkRules: STIGRule[];
  auditJobs: AuditJob[];
  complianceSummary: ComplianceSummary | null;
  dashboard: STIGDashboard | null;
  importHistory: ImportHistoryEntry[];
  isLoading: boolean;
  isUploading: boolean;
  isImporting: boolean;
  error: string | null;

  fetchTargets: () => Promise<void>;
  fetchTarget: (id: string) => Promise<void>;
  fetchBenchmarks: () => Promise<void>;
  fetchBenchmarkRules: (id: string) => Promise<void>;
  uploadSTIG: (file: File) => Promise<STIGUploadResponse>;
  deleteSTIG: (id: string) => Promise<void>;
  importChecklist: (file: File) => Promise<ChecklistImportResponse>;
  fetchImportHistory: () => Promise<void>;
  createTarget: (data: Partial<Target>) => Promise<Target>;
  updateTarget: (id: string, data: Partial<Target>) => Promise<Target>;
  deleteTarget: (id: string) => Promise<void>;
  startAudit: (targetId: string, definitionId: string) => Promise<AuditJob>;
  fetchComplianceSummary: () => Promise<void>;
  fetchDashboard: () => Promise<void>;
}

export const useSTIGStore = create<STIGState>((set) => ({
  targets: [],
  selectedTarget: null,
  benchmarks: [],
  selectedBenchmarkRules: [],
  auditJobs: [],
  complianceSummary: null,
  dashboard: null,
  importHistory: [],
  isLoading: false,
  isUploading: false,
  isImporting: false,
  error: null,

  fetchTargets: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: Target[] }>("/api/v1/stig/assets");
      set({ targets: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch targets";
      set({ error: message, isLoading: false });
    }
  },

  fetchTarget: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: Target }>(
        `/api/v1/stig/assets/${id}`,
      );
      set({ selectedTarget: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch target";
      set({ error: message, isLoading: false });
    }
  },

  fetchBenchmarks: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: STIGDefinition[] }>(
        "/api/v1/stig/benchmarks",
      );
      set({ benchmarks: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch benchmarks";
      set({ error: message, isLoading: false });
    }
  },

  fetchBenchmarkRules: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: STIGRule[] }>(
        `/api/v1/stig/library/${id}/rules`,
      );
      set({ selectedBenchmarkRules: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch benchmark rules";
      set({ error: message, isLoading: false });
    }
  },

  uploadSTIG: async (file: File) => {
    set({ isUploading: true, error: null });
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await api.post<{ data: STIGUploadResponse }>(
        "/api/v1/stig/library/upload",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );
      const stig = response.data.data;

      // Refresh benchmarks list
      const benchmarksResponse = await api.get<{ data: STIGDefinition[] }>(
        "/api/v1/stig/benchmarks",
      );
      set({
        benchmarks: benchmarksResponse.data.data,
        isUploading: false,
      });

      return stig;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to upload STIG";
      set({ error: message, isUploading: false });
      throw err;
    }
  },

  deleteSTIG: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/api/v1/stig/library/${id}`);
      set((state) => ({
        benchmarks: state.benchmarks.filter((b) => b.id !== id),
        isLoading: false,
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete STIG";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  importChecklist: async (file: File) => {
    set({ isImporting: true, error: null });
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await api.post<{ data: ChecklistImportResponse }>(
        "/api/v1/stig/import/checklist",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );
      const result = response.data.data;

      // Refresh targets and audit jobs
      const targetsResponse = await api.get<{ data: Target[] }>(
        "/api/v1/stig/assets",
      );
      set({
        targets: targetsResponse.data.data,
        isImporting: false,
      });

      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to import checklist";
      set({ error: message, isImporting: false });
      throw err;
    }
  },

  fetchImportHistory: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: ImportHistoryEntry[] }>(
        "/api/v1/stig/import/history",
      );
      set({ importHistory: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch import history";
      set({ error: message, isLoading: false });
    }
  },

  createTarget: async (data: Partial<Target>) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{ data: Target }>(
        "/api/v1/stig/assets",
        data,
      );
      const target = response.data.data;
      set((state) => ({
        targets: [...state.targets, target],
        isLoading: false,
      }));
      return target;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create target";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  updateTarget: async (id: string, data: Partial<Target>) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.put<{ data: Target }>(
        `/api/v1/stig/assets/${id}`,
        data,
      );
      const target = response.data.data;
      set((state) => ({
        targets: state.targets.map((t) => (t.id === id ? target : t)),
        selectedTarget:
          state.selectedTarget?.id === id ? target : state.selectedTarget,
        isLoading: false,
      }));
      return target;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update target";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  deleteTarget: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/api/v1/stig/assets/${id}`);
      set((state) => ({
        targets: state.targets.filter((t) => t.id !== id),
        selectedTarget:
          state.selectedTarget?.id === id ? null : state.selectedTarget,
        isLoading: false,
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete target";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  startAudit: async (targetId: string, definitionId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{ data: AuditJob }>(
        "/api/v1/stig/audits",
        {
          targetId,
          definitionId,
        },
      );
      const auditJob = response.data.data;
      set((state) => ({
        auditJobs: [...state.auditJobs, auditJob],
        isLoading: false,
      }));
      return auditJob;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start audit";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  fetchComplianceSummary: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: ComplianceSummary }>(
        "/api/v1/stig/compliance/summary",
      );
      set({ complianceSummary: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to fetch compliance summary";
      set({ error: message, isLoading: false });
    }
  },

  fetchDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: STIGDashboard }>(
        "/api/v1/stig/dashboard",
      );
      set({ dashboard: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch dashboard";
      set({ error: message, isLoading: false });
    }
  },
}));
