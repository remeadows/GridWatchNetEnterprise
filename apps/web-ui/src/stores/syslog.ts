/**
 * Syslog module store
 *
 * Manages syslog events, sources, filters, and forwarders state.
 */

import { create } from "zustand";
import { api } from "../lib/api";

// Types
export interface SyslogEvent {
  id: string;
  sourceId: string | null;
  sourceName: string | null;
  sourceIp: string;
  receivedAt: string;
  facility: string;
  facilityCode: number;
  severity: string;
  severityCode: number;
  version: number;
  timestamp: string | null;
  hostname: string | null;
  appName: string | null;
  procId: string | null;
  msgId: string | null;
  structuredData: Record<string, unknown> | null;
  message: string;
  deviceType: string | null;
  eventType: string | null;
  tags: string[] | null;
}

export interface SyslogSource {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  protocol: "udp" | "tcp" | "tls";
  hostname: string | null;
  deviceType: string | null;
  isActive: boolean;
  eventsReceived: number;
  lastEventAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyslogFilter {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  criteria: {
    severity?: string[];
    facility?: string[];
    hostname?: string;
    messagePattern?: string;
    deviceType?: string;
    eventType?: string;
  };
  action: "alert" | "drop" | "forward" | "tag";
  actionConfig: Record<string, unknown>;
  isActive: boolean;
  matchCount: number;
  lastMatchAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyslogForwarder {
  id: string;
  name: string;
  description: string | null;
  targetHost: string;
  targetPort: number;
  protocol: "udp" | "tcp" | "tls";
  tlsEnabled: boolean;
  tlsVerify: boolean;
  filterCriteria: Record<string, unknown>;
  isActive: boolean;
  eventsForwarded: number;
  lastForwardAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  bufferSize: number;
  retryCount: number;
  retryDelayMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface BufferSettings {
  maxSizeBytes: number;
  maxSizeGb: number;
  currentSizeBytes: number;
  currentSizeGb: number;
  usagePercent: number;
  retentionDays: number;
  cleanupThresholdPercent: number;
  lastCleanupAt: string | null;
  eventsDroppedOverflow: number;
}

export interface EventStats {
  timeRange: {
    hours: number;
    since: string;
  };
  totals: {
    events: number;
    criticalAndAbove: number;
  };
  bySeverity: Array<{
    severity: string;
    severityCode: number;
    count: number;
  }>;
  byFacility: Array<{
    facility: string;
    facilityCode: number;
    count: number;
  }>;
  topSources: Array<{
    sourceIp: string;
    hostname: string | null;
    count: number;
  }>;
}

interface EventFilters {
  severity?: string;
  facility?: string;
  hostname?: string;
  sourceIp?: string;
  deviceType?: string;
  eventType?: string;
  search?: string;
  startTime?: string;
  endTime?: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface SyslogState {
  // Events
  events: SyslogEvent[];
  eventsPagination: Pagination | null;
  eventsFilters: EventFilters;
  eventStats: EventStats | null;

  // Sources
  sources: SyslogSource[];
  sourcesPagination: Pagination | null;

  // Filters
  filters: SyslogFilter[];
  filtersPagination: Pagination | null;

  // Forwarders
  forwarders: SyslogForwarder[];
  forwardersPagination: Pagination | null;

  // Buffer
  bufferSettings: BufferSettings | null;

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchEvents: (page?: number, filters?: EventFilters) => Promise<void>;
  fetchEventStats: (hours?: number) => Promise<void>;
  fetchSources: (page?: number) => Promise<void>;
  createSource: (data: Partial<SyslogSource>) => Promise<SyslogSource>;
  updateSource: (
    id: string,
    data: Partial<SyslogSource>,
  ) => Promise<SyslogSource>;
  deleteSource: (id: string) => Promise<void>;
  fetchFilters: (page?: number) => Promise<void>;
  createFilter: (data: Partial<SyslogFilter>) => Promise<SyslogFilter>;
  updateFilter: (
    id: string,
    data: Partial<SyslogFilter>,
  ) => Promise<SyslogFilter>;
  deleteFilter: (id: string) => Promise<void>;
  fetchForwarders: (page?: number) => Promise<void>;
  createForwarder: (data: Partial<SyslogForwarder>) => Promise<SyslogForwarder>;
  updateForwarder: (
    id: string,
    data: Partial<SyslogForwarder>,
  ) => Promise<SyslogForwarder>;
  deleteForwarder: (id: string) => Promise<void>;
  fetchBufferSettings: () => Promise<void>;
  updateBufferSettings: (data: {
    maxSizeGb?: number;
    retentionDays?: number;
    cleanupThresholdPercent?: number;
  }) => Promise<BufferSettings>;
  setEventsFilters: (filters: EventFilters) => void;
  clearError: () => void;
}

export const useSyslogStore = create<SyslogState>((set, get) => ({
  // Initial state
  events: [],
  eventsPagination: null,
  eventsFilters: {},
  eventStats: null,
  sources: [],
  sourcesPagination: null,
  filters: [],
  filtersPagination: null,
  forwarders: [],
  forwardersPagination: null,
  bufferSettings: null,
  isLoading: false,
  error: null,

  // Events actions
  fetchEvents: async (page = 1, filters?: EventFilters) => {
    set({ isLoading: true, error: null });
    try {
      const currentFilters = filters || get().eventsFilters;
      const params = new URLSearchParams({ page: String(page), limit: "100" });

      if (currentFilters.severity)
        params.append("severity", currentFilters.severity);
      if (currentFilters.facility)
        params.append("facility", currentFilters.facility);
      if (currentFilters.hostname)
        params.append("hostname", currentFilters.hostname);
      if (currentFilters.sourceIp)
        params.append("sourceIp", currentFilters.sourceIp);
      if (currentFilters.deviceType)
        params.append("deviceType", currentFilters.deviceType);
      if (currentFilters.eventType)
        params.append("eventType", currentFilters.eventType);
      if (currentFilters.search) params.append("search", currentFilters.search);
      if (currentFilters.startTime)
        params.append("startTime", currentFilters.startTime);
      if (currentFilters.endTime)
        params.append("endTime", currentFilters.endTime);

      const response = await api.get<{
        data: SyslogEvent[];
        pagination: Pagination;
      }>(`/api/v1/syslog/events?${params}`);
      set({
        events: response.data.data,
        eventsPagination: response.data.pagination,
        eventsFilters: currentFilters,
        isLoading: false,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch events";
      set({ error: message, isLoading: false });
    }
  },

  fetchEventStats: async (hours = 24) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: EventStats }>(
        `/api/v1/syslog/events/stats?hours=${hours}`,
      );
      set({ eventStats: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch event stats";
      set({ error: message, isLoading: false });
    }
  },

  // Sources actions
  fetchSources: async (page = 1) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{
        data: SyslogSource[];
        pagination: Pagination;
      }>(`/api/v1/syslog/sources?page=${page}`);
      set({
        sources: response.data.data,
        sourcesPagination: response.data.pagination,
        isLoading: false,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch sources";
      set({ error: message, isLoading: false });
    }
  },

  createSource: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{ data: SyslogSource }>(
        "/api/v1/syslog/sources",
        data,
      );
      const source = response.data.data;
      set((state) => ({
        sources: [...state.sources, source],
        isLoading: false,
      }));
      return source;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create source";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  updateSource: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.patch<{ data: SyslogSource }>(
        `/api/v1/syslog/sources/${id}`,
        data,
      );
      const source = response.data.data;
      set((state) => ({
        sources: state.sources.map((s) => (s.id === id ? source : s)),
        isLoading: false,
      }));
      return source;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update source";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  deleteSource: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/api/v1/syslog/sources/${id}`);
      set((state) => ({
        sources: state.sources.filter((s) => s.id !== id),
        isLoading: false,
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete source";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  // Filters actions
  fetchFilters: async (page = 1) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{
        data: SyslogFilter[];
        pagination: Pagination;
      }>(`/api/v1/syslog/filters?page=${page}`);
      set({
        filters: response.data.data,
        filtersPagination: response.data.pagination,
        isLoading: false,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch filters";
      set({ error: message, isLoading: false });
    }
  },

  createFilter: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{ data: SyslogFilter }>(
        "/api/v1/syslog/filters",
        data,
      );
      const filter = response.data.data;
      set((state) => ({
        filters: [...state.filters, filter],
        isLoading: false,
      }));
      return filter;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create filter";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  updateFilter: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.patch<{ data: SyslogFilter }>(
        `/api/v1/syslog/filters/${id}`,
        data,
      );
      const filter = response.data.data;
      set((state) => ({
        filters: state.filters.map((f) => (f.id === id ? filter : f)),
        isLoading: false,
      }));
      return filter;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update filter";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  deleteFilter: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/api/v1/syslog/filters/${id}`);
      set((state) => ({
        filters: state.filters.filter((f) => f.id !== id),
        isLoading: false,
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete filter";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  // Forwarders actions
  fetchForwarders: async (page = 1) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{
        data: SyslogForwarder[];
        pagination: Pagination;
      }>(`/api/v1/syslog/forwarders?page=${page}`);
      set({
        forwarders: response.data.data,
        forwardersPagination: response.data.pagination,
        isLoading: false,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch forwarders";
      set({ error: message, isLoading: false });
    }
  },

  createForwarder: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{ data: SyslogForwarder }>(
        "/api/v1/syslog/forwarders",
        data,
      );
      const forwarder = response.data.data;
      set((state) => ({
        forwarders: [...state.forwarders, forwarder],
        isLoading: false,
      }));
      return forwarder;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create forwarder";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  updateForwarder: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.patch<{ data: SyslogForwarder }>(
        `/api/v1/syslog/forwarders/${id}`,
        data,
      );
      const forwarder = response.data.data;
      set((state) => ({
        forwarders: state.forwarders.map((f) => (f.id === id ? forwarder : f)),
        isLoading: false,
      }));
      return forwarder;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update forwarder";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  deleteForwarder: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/api/v1/syslog/forwarders/${id}`);
      set((state) => ({
        forwarders: state.forwarders.filter((f) => f.id !== id),
        isLoading: false,
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete forwarder";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  // Buffer settings actions
  fetchBufferSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: BufferSettings }>(
        "/api/v1/syslog/buffer-settings",
      );
      set({ bufferSettings: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch buffer settings";
      set({ error: message, isLoading: false });
    }
  },

  updateBufferSettings: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.patch<{ data: BufferSettings }>(
        "/api/v1/syslog/buffer-settings",
        data,
      );
      const settings = response.data.data;
      set({ bufferSettings: settings, isLoading: false });
      return settings;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update buffer settings";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  // UI actions
  setEventsFilters: (filters) => {
    set({ eventsFilters: filters });
  },

  clearError: () => {
    set({ error: null });
  },
}));
