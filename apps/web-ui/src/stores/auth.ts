import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, AuthTokens } from "@netnynja/shared-types";
import { api } from "../lib/api";

interface AuthState {
  user: User | null;
  accessToken: string | null; // Only store access token in memory/localStorage
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  refreshTokens: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post<{
            data: { user: User; tokens: AuthTokens };
          }>(
            "/api/v1/auth/login",
            { username, password },
            {
              withCredentials: true, // Enable cookies
            },
          );

          const { user, tokens } = response.data.data;
          set({
            user,
            accessToken: tokens.accessToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Login failed";
          set({ error: message, isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        try {
          // Logout - server will clear refresh token cookie
          await api.post(
            "/api/v1/auth/logout",
            {},
            {
              withCredentials: true,
            },
          );
        } catch {
          // Ignore logout errors
        } finally {
          set({
            user: null,
            accessToken: null,
            isAuthenticated: false,
          });
        }
      },

      checkAuth: async () => {
        const { accessToken } = get();
        if (!accessToken) {
          set({ isAuthenticated: false });
          return;
        }

        try {
          const response = await api.get<{ data: { user: User } }>(
            "/api/v1/auth/me",
          );
          set({ user: response.data.data.user, isAuthenticated: true });
        } catch {
          // Token expired or invalid - try refresh
          const { refreshTokens, logout } = get();
          try {
            await refreshTokens();
          } catch {
            await logout();
          }
        }
      },

      refreshTokens: async () => {
        try {
          // Refresh token is sent automatically via HttpOnly cookie
          const response = await api.post<{
            data: { tokens: AuthTokens };
          }>(
            "/api/v1/auth/refresh",
            {},
            {
              withCredentials: true, // Send refresh token cookie
            },
          );

          set({
            accessToken: response.data.data.tokens.accessToken,
            isAuthenticated: true,
          });
        } catch (err) {
          set({ accessToken: null, isAuthenticated: false });
          throw err;
        }
      },
    }),
    {
      name: "netnynja-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
