/**
 * NPM (Network Performance Monitoring) Module
 *
 * Provides device monitoring, performance metrics, and alerting.
 */

export { NPMDevicesPage as DevicesPage } from "./pages/DevicesPage";
export { NPMDeviceDetailPage as DeviceDetailPage } from "./pages/DeviceDetailPage";
export { NPMAlertsPage as AlertsPage } from "./pages/AlertsPage";
export { SNMPv3CredentialsPage } from "./pages/SNMPv3CredentialsPage";
export { DeviceGroupsPage } from "./pages/DeviceGroupsPage";

// Module metadata
export const npmModuleConfig = {
  name: "NPM",
  description: "Network Performance Monitoring",
  icon: "chart-bar",
  basePath: "/npm",
  routes: [
    { path: "/npm", label: "Devices", icon: "server" },
    { path: "/npm/alerts", label: "Alerts", icon: "bell" },
    {
      path: "/npm/snmpv3-credentials",
      label: "SNMPv3 Credentials",
      icon: "key",
    },
  ],
};
