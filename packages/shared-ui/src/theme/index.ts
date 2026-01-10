/**
 * NetNynja Enterprise - Theme Configuration
 * Dark cyberpunk theme with neon accents
 */

export const colors = {
  // Electric blue - Primary brand color
  primary: {
    50: "#e0f7ff",
    100: "#b3ecff",
    200: "#80e0ff",
    300: "#4dd4ff",
    400: "#26cbff",
    500: "#00d4ff", // Electric blue - PRIMARY BRAND
    600: "#00a8cc",
    700: "#007d99",
    800: "#005166",
    900: "#002633",
    950: "#001319",
  },
  // Dark backgrounds
  dark: {
    950: "#050508",
    900: "#0a0e17",
    800: "#111827",
    700: "#1e293b",
    600: "#334155",
    500: "#475569",
  },
  // Silver/gray for text
  silver: {
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
  },
  // Accent - Neon magenta
  accent: {
    300: "#f0abfc",
    400: "#e879f9",
    500: "#d946ef",
    600: "#c026d3",
    700: "#a21caf",
    900: "#4a044e",
  },
  success: {
    200: "#bbf7d0",
    300: "#86efac",
    400: "#4ade80",
    500: "#22c55e",
    600: "#16a34a",
    700: "#15803d",
    900: "#14532d",
  },
  warning: {
    200: "#fde68a",
    300: "#fcd34d",
    400: "#fbbf24",
    500: "#f59e0b",
    600: "#d97706",
    700: "#b45309",
    900: "#78350f",
  },
  error: {
    200: "#fecaca",
    300: "#fca5a5",
    400: "#f87171",
    500: "#ef4444",
    600: "#dc2626",
    700: "#b91c1c",
    900: "#7f1d1d",
  },
  info: {
    200: "#bae6fd",
    300: "#7dd3fc",
    400: "#38bdf8",
    500: "#0ea5e9",
    600: "#0284c7",
    700: "#0369a1",
    900: "#0c4a6e",
  },
} as const;

export const moduleColors = {
  ipam: {
    primary: "#22c55e", // success-500 - neon green
    secondary: "#16a34a", // success-600
    bg: "#0a0e17", // dark-900
    bgDark: "#14532d", // success-900
  },
  npm: {
    primary: "#00d4ff", // primary-500 - electric blue
    secondary: "#00a8cc", // primary-600
    bg: "#0a0e17", // dark-900
    bgDark: "#002633", // primary-900
  },
  stig: {
    primary: "#f59e0b", // warning-500 - amber
    secondary: "#d97706", // warning-600
    bg: "#0a0e17", // dark-900
    bgDark: "#78350f", // warning-900
  },
  settings: {
    primary: "#64748b", // silver-500
    secondary: "#475569", // silver-600
    bg: "#0a0e17", // dark-900
    bgDark: "#1e293b", // dark-700
  },
  syslog: {
    primary: "#d946ef", // accent-500 - neon magenta
    secondary: "#c026d3", // accent-600
    bg: "#0a0e17", // dark-900
    bgDark: "#4a044e", // accent-900
  },
} as const;

export type ModuleType = "ipam" | "npm" | "stig" | "settings" | "syslog";

export interface Theme {
  mode: "dark"; // Dark mode only
  colors: typeof colors;
  moduleColors: typeof moduleColors;
}

export const darkTheme: Theme = {
  mode: "dark",
  colors,
  moduleColors,
};
