import { create } from "zustand";
import { api } from "../lib/api";

export interface DeviceGroup {
  id: string;
  name: string;
  description: string | null;
  color: string;
  parentId: string | null;
  parentName: string | null;
  deviceCount: number;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeviceGroupInput {
  name: string;
  description?: string;
  color?: string;
  parentId?: string;
}

export interface UpdateDeviceGroupInput {
  name?: string;
  description?: string;
  color?: string;
  parentId?: string | null;
  isActive?: boolean;
}

interface DeviceGroupsState {
  groups: DeviceGroup[];
  selectedGroup: DeviceGroup | null;
  isLoading: boolean;
  error: string | null;

  fetchGroups: () => Promise<void>;
  fetchGroup: (id: string) => Promise<void>;
  createGroup: (data: CreateDeviceGroupInput) => Promise<DeviceGroup>;
  updateGroup: (
    id: string,
    data: UpdateDeviceGroupInput,
  ) => Promise<DeviceGroup>;
  deleteGroup: (id: string) => Promise<void>;
  assignDevicesToGroup: (
    groupId: string,
    deviceIds: string[],
  ) => Promise<{ assignedCount: number }>;
  removeDevicesFromGroup: (
    groupId: string,
    deviceIds: string[],
  ) => Promise<{ removedCount: number }>;
}

export const useDeviceGroupsStore = create<DeviceGroupsState>((set) => ({
  groups: [],
  selectedGroup: null,
  isLoading: false,
  error: null,

  fetchGroups: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: DeviceGroup[] }>(
        "/api/v1/npm/device-groups",
      );
      set({ groups: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch device groups";
      set({ error: message, isLoading: false });
    }
  },

  fetchGroup: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ data: DeviceGroup }>(
        `/api/v1/npm/device-groups/${id}`,
      );
      set({ selectedGroup: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch device group";
      set({ error: message, isLoading: false });
    }
  },

  createGroup: async (data: CreateDeviceGroupInput) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{ data: DeviceGroup }>(
        "/api/v1/npm/device-groups",
        data,
      );
      const group = response.data.data;
      set((state) => ({
        groups: [...state.groups, group],
        isLoading: false,
      }));
      return group;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create device group";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  updateGroup: async (id: string, data: UpdateDeviceGroupInput) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.patch<{ data: DeviceGroup }>(
        `/api/v1/npm/device-groups/${id}`,
        data,
      );
      const group = response.data.data;
      set((state) => ({
        groups: state.groups.map((g) => (g.id === id ? group : g)),
        selectedGroup:
          state.selectedGroup?.id === id ? group : state.selectedGroup,
        isLoading: false,
      }));
      return group;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update device group";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  deleteGroup: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/api/v1/npm/device-groups/${id}`);
      set((state) => ({
        groups: state.groups.filter((g) => g.id !== id),
        selectedGroup:
          state.selectedGroup?.id === id ? null : state.selectedGroup,
        isLoading: false,
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete device group";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  assignDevicesToGroup: async (groupId: string, deviceIds: string[]) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<{ data: { assignedCount: number } }>(
        `/api/v1/npm/device-groups/${groupId}/devices`,
        { deviceIds },
      );
      // Refresh groups to get updated counts
      const groupsResponse = await api.get<{ data: DeviceGroup[] }>(
        "/api/v1/npm/device-groups",
      );
      set({ groups: groupsResponse.data.data, isLoading: false });
      return response.data.data;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to assign devices to group";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  removeDevicesFromGroup: async (groupId: string, deviceIds: string[]) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.delete<{ data: { removedCount: number } }>(
        `/api/v1/npm/device-groups/${groupId}/devices`,
        { data: { deviceIds } },
      );
      // Refresh groups to get updated counts
      const groupsResponse = await api.get<{ data: DeviceGroup[] }>(
        "/api/v1/npm/device-groups",
      );
      set({ groups: groupsResponse.data.data, isLoading: false });
      return response.data.data;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to remove devices from group";
      set({ error: message, isLoading: false });
      throw err;
    }
  },
}));
