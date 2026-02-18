import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Determine if running in Docker container
const isDocker =
  process.env.NODE_ENV === "development" && process.cwd() === "/app";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // In Docker, packages are mounted at /packages; use pre-built dist files
      "@gridwatch/shared-ui": isDocker
        ? "/packages/shared-ui/dist"
        : path.resolve(__dirname, "../../packages/shared-ui/src"),
      "@gridwatch/shared-types": isDocker
        ? "/packages/shared-types/dist"
        : path.resolve(__dirname, "../../packages/shared-types/src"),
    },
  },
  // Ensure Vite looks in the right place for dependencies when resolving from shared packages
  optimizeDeps: {
    include: [
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
      "recharts",
      "@tanstack/react-table",
      "@heroicons/react",
    ],
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      "/api": {
        // Use Docker service name when running in container, localhost for local dev
        target: isDocker ? "http://gateway:3001" : "http://localhost:3001",
        changeOrigin: true,
      },
    },
    // Disable strict filesystem access to allow Docker volume mounts
    fs: {
      strict: false,
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
