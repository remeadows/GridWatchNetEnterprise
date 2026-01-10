/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../packages/shared-ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  // Dark mode is always on - no toggle, cyberpunk theme only
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // NetNynja Brand Colors - Cyberpunk Dark Theme
        // Extracted from brand images: NetNNJA1.jpg and NetNNJA2.jpg

        // Background colors - deep dark blues/blacks
        dark: {
          950: "#050508", // Deepest black
          900: "#0a0e17", // Primary background
          850: "#0f1419", // Slightly lighter
          800: "#0f172a", // Card backgrounds
          700: "#1a1a2e", // Elevated surfaces
          600: "#1e293b", // Borders/dividers
          500: "#334155", // Muted text backgrounds
          400: "#475569", // Disabled states
        },

        // Primary brand color - Electric/Neon Blue (ninja eyes, logo glow)
        primary: {
          50: "#f0fdff",
          100: "#ccfbff",
          200: "#99f6ff",
          300: "#66efff",
          400: "#22d3ee", // Bright cyan
          500: "#00d4ff", // Electric blue - PRIMARY BRAND
          600: "#06b6d4", // Cyan
          700: "#0891b2",
          800: "#0e7490",
          900: "#155e75",
          950: "#083344",
        },

        // Accent Magenta/Pink - neon city lights
        accent: {
          50: "#fdf4ff",
          100: "#fae8ff",
          200: "#f5d0fe",
          300: "#f0abfc",
          400: "#e879f9",
          500: "#d946ef", // Neon magenta - ACCENT
          600: "#c026d3",
          700: "#a21caf",
          800: "#86198f",
          900: "#701a75",
          950: "#4a044e",
        },

        // Secondary - Metallic Silver/Chrome (logo elements)
        silver: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
        },

        // Success - Neon Green (data/matrix style)
        success: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e", // Neon green
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },

        // Warning - Amber/Orange
        warning: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
        },

        // Error - Red with slight pink tint
        error: {
          50: "#fff1f2",
          100: "#ffe4e6",
          200: "#fecdd3",
          300: "#fda4af",
          400: "#fb7185",
          500: "#f43f5e", // Rose red
          600: "#e11d48",
          700: "#be123c",
          800: "#9f1239",
          900: "#881337",
        },

        // Info - matches primary cyan
        info: {
          50: "#f0fdff",
          100: "#ccfbff",
          200: "#99f6ff",
          300: "#66efff",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
          800: "#155e75",
          900: "#164e63",
        },
      },

      // Custom background gradients for cyberpunk effect
      backgroundImage: {
        "cyber-gradient":
          "linear-gradient(135deg, #0a0e17 0%, #1a1a2e 50%, #0f172a 100%)",
        "cyber-glow":
          "radial-gradient(ellipse at center, rgba(0, 212, 255, 0.1) 0%, transparent 70%)",
        "neon-border":
          "linear-gradient(90deg, #00d4ff, #d946ef, #22c55e, #00d4ff)",
      },

      // Box shadows with neon glow effects
      boxShadow: {
        "neon-blue": "0 0 5px #00d4ff, 0 0 20px rgba(0, 212, 255, 0.3)",
        "neon-pink": "0 0 5px #d946ef, 0 0 20px rgba(217, 70, 239, 0.3)",
        "neon-green": "0 0 5px #22c55e, 0 0 20px rgba(34, 197, 94, 0.3)",
        "cyber-card":
          "0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -2px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 212, 255, 0.1)",
      },

      // Animation for neon pulse effects
      animation: {
        "pulse-neon": "pulse-neon 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        glow: "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        "pulse-neon": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        glow: {
          "0%": {
            boxShadow: "0 0 5px #00d4ff, 0 0 10px rgba(0, 212, 255, 0.3)",
          },
          "100%": {
            boxShadow: "0 0 10px #00d4ff, 0 0 30px rgba(0, 212, 255, 0.5)",
          },
        },
      },
    },
  },
  plugins: [],
};
