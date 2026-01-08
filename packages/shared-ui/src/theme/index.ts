/**
 * NetNynja Enterprise - Theme Configuration
 * Supports dark/light mode with consistent design tokens
 */

export const colors = {
  primary: {
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    400: "#60a5fa",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
    800: "#1e40af",
    900: "#1e3a8a",
    950: "#172554",
  },
  gray: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
    950: "#030712",
  },
  success: {
    50: "#f0fdf4",
    100: "#dcfce7",
    200: "#bbf7d0",
    500: "#22c55e",
    600: "#16a34a",
    700: "#15803d",
  },
  warning: {
    50: "#fffbeb",
    100: "#fef3c7",
    200: "#fde68a",
    500: "#f59e0b",
    600: "#d97706",
    700: "#b45309",
  },
  error: {
    50: "#fef2f2",
    100: "#fee2e2",
    200: "#fecaca",
    500: "#ef4444",
    600: "#dc2626",
    700: "#b91c1c",
  },
  info: {
    50: "#eff6ff",
    100: "#dbeafe",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
  },
} as const;

export const moduleColors = {
  ipam: {
    primary: "#10b981", // emerald-500
    secondary: "#059669", // emerald-600
    bg: "#ecfdf5", // emerald-50
    bgDark: "#064e3b", // emerald-900
  },
  npm: {
    primary: "#6366f1", // indigo-500
    secondary: "#4f46e5", // indigo-600
    bg: "#eef2ff", // indigo-50
    bgDark: "#312e81", // indigo-900
  },
  stig: {
    primary: "#f59e0b", // amber-500
    secondary: "#d97706", // amber-600
    bg: "#fffbeb", // amber-50
    bgDark: "#78350f", // amber-900
  },
  settings: {
    primary: "#6b7280", // gray-500
    secondary: "#4b5563", // gray-600
    bg: "#f9fafb", // gray-50
    bgDark: "#1f2937", // gray-800
  },
  syslog: {
    primary: "#8b5cf6", // violet-500
    secondary: "#7c3aed", // violet-600
    bg: "#f5f3ff", // violet-50
    bgDark: "#4c1d95", // violet-900
  },
} as const;

export type ModuleType = "ipam" | "npm" | "stig" | "settings" | "syslog";

export interface Theme {
  mode: "light" | "dark";
  colors: typeof colors;
  moduleColors: typeof moduleColors;
}

export const lightTheme: Theme = {
  mode: "light",
  colors,
  moduleColors,
};

export const darkTheme: Theme = {
  mode: "dark",
  colors,
  moduleColors,
};
