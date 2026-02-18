import { create } from "zustand";
import type { User, UserRole } from "@gridwatch/shared-types";
import { api } from "../lib/api";

interface UsersState {
  users: User[];
  selectedUser: User | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  } | null;
  isLoading: boolean;
  error: string | null;

  fetchUsers: (params?: {
    page?: number;
    limit?: number;
    search?: string;
  }) => Promise<void>;
  fetchUser: (id: string) => Promise<void>;
  createUser: (data: CreateUserInput) => Promise<User>;
  updateUser: (id: string, data: UpdateUserInput) => Promise<User>;
  deleteUser: (id: string) => Promise<void>;
  resetPassword: (id: string, newPassword: string) => Promise<void>;
  unlockUser: (id: string) => Promise<void>;
  clearSelectedUser: () => void;
}

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface UpdateUserInput {
  email?: string;
  password?: string;
  role?: UserRole;
  isActive?: boolean;
}

interface UsersResponse {
  success: boolean;
  data: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface UserResponse {
  success: boolean;
  data: User;
}

export const useUsersStore = create<UsersState>((set) => ({
  users: [],
  selectedUser: null,
  pagination: null,
  isLoading: false,
  error: null,

  fetchUsers: async (params = {}) => {
    set({ isLoading: true, error: null });
    try {
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.set("page", params.page.toString());
      if (params.limit) queryParams.set("limit", params.limit.toString());
      if (params.search) queryParams.set("search", params.search);

      const url = `/api/v1/users${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
      const response = await api.get<UsersResponse>(url);
      set({
        users: response.data.data,
        pagination: response.data.pagination,
        isLoading: false,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch users";
      set({ error: message, isLoading: false });
    }
  },

  fetchUser: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<UserResponse>(`/api/v1/users/${id}`);
      set({ selectedUser: response.data.data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch user";
      set({ error: message, isLoading: false });
    }
  },

  createUser: async (data: CreateUserInput) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<UserResponse>("/api/v1/users", data);
      const user = response.data.data;
      set((state) => ({
        users: [...state.users, user],
        isLoading: false,
      }));
      return user;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create user";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  updateUser: async (id: string, data: UpdateUserInput) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.put<UserResponse>(`/api/v1/users/${id}`, data);
      const user = response.data.data;
      set((state) => ({
        users: state.users.map((u) => (u.id === id ? user : u)),
        selectedUser: state.selectedUser?.id === id ? user : state.selectedUser,
        isLoading: false,
      }));
      return user;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update user";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  deleteUser: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/api/v1/users/${id}`);
      set((state) => ({
        users: state.users.filter((u) => u.id !== id),
        selectedUser: state.selectedUser?.id === id ? null : state.selectedUser,
        isLoading: false,
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete user";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  resetPassword: async (id: string, newPassword: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.post(`/api/v1/users/${id}/reset-password`, { newPassword });
      set({ isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to reset password";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  unlockUser: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.post(`/api/v1/users/${id}/unlock`);
      set((state) => ({
        users: state.users.map((u) =>
          u.id === id ? { ...u, failedLoginAttempts: 0 } : u,
        ),
        isLoading: false,
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to unlock user";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  clearSelectedUser: () => {
    set({ selectedUser: null });
  },
}));
