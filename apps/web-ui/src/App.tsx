import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./stores/auth";
import { useEffect } from "react";

// Layouts
import { MainLayout } from "./components/layouts/MainLayout";
import { AuthLayout } from "./components/layouts/AuthLayout";

// Auth pages
import { LoginPage } from "./pages/auth/LoginPage";

// Dashboard
import { DashboardPage } from "./pages/dashboard/DashboardPage";

// IPAM module
import { IPAMNetworksPage } from "./modules/ipam/pages/NetworksPage";
import { IPAMNetworkDetailPage } from "./modules/ipam/pages/NetworkDetailPage";

// NPM module
import { NPMDevicesPage } from "./modules/npm/pages/DevicesPage";
import { NPMDeviceDetailPage } from "./modules/npm/pages/DeviceDetailPage";
import { NPMAlertsPage } from "./modules/npm/pages/AlertsPage";
import { SNMPv3CredentialsPage } from "./modules/npm/pages/SNMPv3CredentialsPage";
import { NPMDiscoveryPage } from "./modules/npm/pages/DiscoveryPage";
import { DeviceGroupsPage } from "./modules/npm/pages/DeviceGroupsPage";

// STIG module
import { STIGBenchmarksPage } from "./modules/stig/pages/BenchmarksPage";
import { STIGAssetsPage } from "./modules/stig/pages/AssetsPage";
import { STIGCompliancePage } from "./modules/stig/pages/CompliancePage";
import { STIGLibraryPage } from "./modules/stig/pages/LibraryPage";

// Syslog module
import { SyslogEventsPage } from "./modules/syslog/pages/EventsPage";
import { SyslogSourcesPage } from "./modules/syslog/pages/SourcesPage";
import { SyslogFiltersPage } from "./modules/syslog/pages/FiltersPage";

// Settings module
import { UsersPage } from "./modules/settings/pages/UsersPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  // Force dark mode on mount - NetNynja brand is dark cyberpunk only
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <div className="min-h-screen bg-dark-900">
      <Routes>
        {/* Auth routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        {/* Protected routes */}
        <Route
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          {/* Dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* IPAM Module */}
          <Route path="/ipam">
            <Route index element={<Navigate to="/ipam/networks" replace />} />
            <Route path="networks" element={<IPAMNetworksPage />} />
            <Route path="networks/:id" element={<IPAMNetworkDetailPage />} />
          </Route>

          {/* NPM Module */}
          <Route path="/npm">
            <Route index element={<Navigate to="/npm/devices" replace />} />
            <Route path="devices" element={<NPMDevicesPage />} />
            <Route path="devices/:id" element={<NPMDeviceDetailPage />} />
            <Route path="discovery" element={<NPMDiscoveryPage />} />
            <Route path="alerts" element={<NPMAlertsPage />} />
            <Route path="credentials" element={<SNMPv3CredentialsPage />} />
            <Route path="groups" element={<DeviceGroupsPage />} />
          </Route>

          {/* STIG Module */}
          <Route path="/stig">
            <Route index element={<Navigate to="/stig/library" replace />} />
            <Route path="library" element={<STIGLibraryPage />} />
            <Route path="benchmarks" element={<STIGBenchmarksPage />} />
            <Route path="assets" element={<STIGAssetsPage />} />
            <Route path="compliance" element={<STIGCompliancePage />} />
          </Route>

          {/* Syslog Module */}
          <Route path="/syslog">
            <Route index element={<Navigate to="/syslog/events" replace />} />
            <Route path="events" element={<SyslogEventsPage />} />
            <Route path="sources" element={<SyslogSourcesPage />} />
            <Route path="filters" element={<SyslogFiltersPage />} />
          </Route>

          {/* Settings Module */}
          <Route path="/settings">
            <Route index element={<Navigate to="/settings/users" replace />} />
            <Route path="users" element={<UsersPage />} />
          </Route>
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  );
}

export default App;
