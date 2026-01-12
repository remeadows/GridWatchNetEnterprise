import { create } from "zustand";
import type { SNMPv3Credential } from "@netnynja/shared-types";
import { api } from "../lib/api";

export interface CreateSNMPv3CredentialInput {
  name: string;
  description?: string;
  username: string;
  securityLevel: "noAuthNoPriv" | "authNoPriv" | "authPriv";
  authProtocol?: "SHA" | "SHA-224" | "SHA-256" | "SHA-384" | "SHA-512";
  authPassword?: string;
  privProtocol?: "AES" | "AES-192" | "AES-256";
  privPassword?: string;
  contextName?: string;
  contextEngineId?: string;
}

export interface UpdateSNMPv3CredentialInput {
  name?: string;
  description?: string;
  username?: string;
  securityLevel?: "noAuthNoPriv" | "authNoPriv" | "authPriv";
  authProtocol?: "SHA" | "SHA-224" | "SHA-256" | "SHA-384" | "SHA-512";
  authPassword?: string;
  privProtocol?: "AES" | "AES-192" | "AES-256";
  privPassword?: string;
  contextName?: string;
  contextEngineId?: string;
}

export interface TestCredentialResult {
  tested: boolean;
  targetIp: string;
  port: number;
  credentialId: string;
  credentialName: string;
  responseTimeMs?: number;
  // Success fields
  sysDescr?: string;
  sysName?: string;
  sysUptime?: number;
  sysContact?: string;
  sysLocation?: string;
  // Error field
  error?: string;
}

interface SNMPv3CredentialsState {
  credentials: SNMPv3Credential[];
  selectedCredential: SNMPv3Credential | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  } | null;
  isLoading: boolean;
  error: string | null;

  fetchCredentials: (params?: {
    page?: number;
    search?: string;
  }) => Promise<void>;
  fetchCredential: (id: string) => Promise<void>;
  createCredential: (
    data: CreateSNMPv3CredentialInput,
  ) => Promise<SNMPv3Credential>;
  updateCredential: (
    id: string,
    data: UpdateSNMPv3CredentialInput,
  ) => Promise<SNMPv3Credential>;
  deleteCredential: (id: string) => Promise<void>;
  testCredential: (
    id: string,
    targetIp: string,
    port?: number,
  ) => Promise<TestCredentialResult>;
  getCredentialDevices: (id: string) => Promise<{
    credential: { id: string; name: string };
    devices: Array<{
      id: string;
      name: string;
      ipAddress: string;
      deviceType?: string;
      vendor?: string;
      status: string;
    }>;
    totalDevices: number;
  }>;
}

export const useSNMPv3CredentialsStore = create<SNMPv3CredentialsState>(
  (set) => ({
    credentials: [],
    selectedCredential: null,
    pagination: null,
    isLoading: false,
    error: null,

    fetchCredentials: async (params) => {
      set({ isLoading: true, error: null });
      try {
        const queryParams = new URLSearchParams();
        if (params?.page) queryParams.set("page", String(params.page));
        if (params?.search) queryParams.set("search", params.search);

        const url = `/api/v1/npm/snmpv3-credentials${queryParams.toString() ? `?${queryParams}` : ""}`;
        const response = await api.get<{
          data: SNMPv3Credential[];
          pagination: {
            page: number;
            limit: number;
            total: number;
            pages: number;
          };
        }>(url);
        set({
          credentials: response.data.data,
          pagination: response.data.pagination,
          isLoading: false,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch credentials";
        set({ error: message, isLoading: false });
      }
    },

    fetchCredential: async (id) => {
      set({ isLoading: true, error: null });
      try {
        const response = await api.get<{ data: SNMPv3Credential }>(
          `/api/v1/npm/snmpv3-credentials/${id}`,
        );
        set({ selectedCredential: response.data.data, isLoading: false });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch credential";
        set({ error: message, isLoading: false });
      }
    },

    createCredential: async (data) => {
      set({ isLoading: true, error: null });
      try {
        const response = await api.post<{ data: SNMPv3Credential }>(
          "/api/v1/npm/snmpv3-credentials",
          data,
        );
        const credential = response.data.data;
        set((state) => ({
          credentials: [...state.credentials, credential],
          isLoading: false,
        }));
        return credential;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create credential";
        set({ error: message, isLoading: false });
        throw err;
      }
    },

    updateCredential: async (id, data) => {
      set({ isLoading: true, error: null });
      try {
        const response = await api.patch<{ data: SNMPv3Credential }>(
          `/api/v1/npm/snmpv3-credentials/${id}`,
          data,
        );
        const credential = response.data.data;
        set((state) => ({
          credentials: state.credentials.map((c) =>
            c.id === id ? credential : c,
          ),
          selectedCredential:
            state.selectedCredential?.id === id
              ? credential
              : state.selectedCredential,
          isLoading: false,
        }));
        return credential;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update credential";
        set({ error: message, isLoading: false });
        throw err;
      }
    },

    deleteCredential: async (id) => {
      set({ isLoading: true, error: null });
      try {
        await api.delete(`/api/v1/npm/snmpv3-credentials/${id}`);
        set((state) => ({
          credentials: state.credentials.filter((c) => c.id !== id),
          selectedCredential:
            state.selectedCredential?.id === id
              ? null
              : state.selectedCredential,
          isLoading: false,
        }));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete credential";
        set({ error: message, isLoading: false });
        throw err;
      }
    },

    testCredential: async (id, targetIp, port = 161) => {
      set({ isLoading: true, error: null });
      try {
        const response = await api.post<{ data: TestCredentialResult }>(
          `/api/v1/npm/snmpv3-credentials/${id}/test`,
          {
            targetIp,
            port,
          },
        );
        set({ isLoading: false });
        return response.data.data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to test credential";
        set({ error: message, isLoading: false });
        throw err;
      }
    },

    getCredentialDevices: async (id) => {
      set({ isLoading: true, error: null });
      try {
        const response = await api.get<{
          data: {
            credential: { id: string; name: string };
            devices: Array<{
              id: string;
              name: string;
              ipAddress: string;
              deviceType?: string;
              vendor?: string;
              status: string;
            }>;
            totalDevices: number;
          };
        }>(`/api/v1/npm/snmpv3-credentials/${id}/devices`);
        set({ isLoading: false });
        return response.data.data;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to get credential devices";
        set({ error: message, isLoading: false });
        throw err;
      }
    },
  }),
);
