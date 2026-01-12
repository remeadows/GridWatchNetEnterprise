import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "../stores/auth";

export const api = axios.create({
  baseURL: "",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Enable cookies for all requests (for refresh token HttpOnly cookie)
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken } = useAuthStore.getState();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Track if we're currently refreshing to prevent parallel refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<void> | null = null;

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;

    // Don't retry refresh endpoint to prevent infinite loops
    if (originalRequest?.url?.includes("/auth/refresh")) {
      return Promise.reject(error);
    }

    // If 401 and we haven't already tried to refresh
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !(originalRequest as { _retry?: boolean })._retry
    ) {
      (originalRequest as { _retry?: boolean })._retry = true;

      try {
        // If already refreshing, wait for that to complete
        if (isRefreshing && refreshPromise) {
          await refreshPromise;
        } else {
          isRefreshing = true;
          refreshPromise = useAuthStore.getState().refreshTokens();
          await refreshPromise;
          isRefreshing = false;
          refreshPromise = null;
        }

        const { accessToken } = useAuthStore.getState();

        if (accessToken) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch {
        isRefreshing = false;
        refreshPromise = null;
        await useAuthStore.getState().logout();
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  },
);

export default api;
