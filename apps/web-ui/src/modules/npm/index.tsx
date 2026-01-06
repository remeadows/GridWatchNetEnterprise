/**
 * NPM (Network Performance Monitoring) Module
 *
 * Provides device monitoring, performance metrics, and alerting.
 */

export { default as DevicesPage } from './pages/DevicesPage';
export { default as DeviceDetailPage } from './pages/DeviceDetailPage';
export { default as AlertsPage } from './pages/AlertsPage';

// Module metadata
export const npmModuleConfig = {
  name: 'NPM',
  description: 'Network Performance Monitoring',
  icon: 'chart-bar',
  basePath: '/npm',
  routes: [
    { path: '/npm', label: 'Devices', icon: 'server' },
    { path: '/npm/alerts', label: 'Alerts', icon: 'bell' },
  ],
};
