/**
 * STIG Manager Module
 *
 * Provides STIG compliance auditing, benchmarks management, and reporting.
 */

export { default as BenchmarksPage } from './pages/BenchmarksPage';
export { default as AssetsPage } from './pages/AssetsPage';
export { default as CompliancePage } from './pages/CompliancePage';

// Module metadata
export const stigModuleConfig = {
  name: 'STIG Manager',
  description: 'Security Technical Implementation Guide compliance',
  icon: 'shield-check',
  basePath: '/stig',
  routes: [
    { path: '/stig', label: 'Compliance', icon: 'chart-pie' },
    { path: '/stig/benchmarks', label: 'Benchmarks', icon: 'document-text' },
    { path: '/stig/assets', label: 'Assets', icon: 'server' },
  ],
};
