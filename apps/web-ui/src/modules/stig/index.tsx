/**
 * STIG Manager Module
 *
 * Provides STIG compliance auditing, benchmarks management, and reporting.
 */

export { STIGBenchmarksPage as BenchmarksPage } from "./pages/BenchmarksPage";
export { STIGAssetsPage as AssetsPage } from "./pages/AssetsPage";
export { STIGCompliancePage as CompliancePage } from "./pages/CompliancePage";
export { STIGLibraryPage as LibraryPage } from "./pages/LibraryPage";

// Module metadata
export const stigModuleConfig = {
  name: "STIG Manager",
  description: "Security Technical Implementation Guide compliance",
  icon: "shield-check",
  basePath: "/stig",
  routes: [
    { path: "/stig", label: "Compliance", icon: "chart-pie" },
    { path: "/stig/library", label: "Library", icon: "archive" },
    { path: "/stig/benchmarks", label: "Benchmarks", icon: "document-text" },
    { path: "/stig/assets", label: "Assets", icon: "server" },
  ],
};
