import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  StatsCard,
  Badge,
  LineChart,
  PieChart,
} from "@gridwatch/shared-ui";
import type { Alert, Device } from "@gridwatch/shared-types";
import { useIPAMStore } from "../../stores/ipam";
import { useNPMStore } from "../../stores/npm";
import { useSTIGStore } from "../../stores/stig";

export function DashboardPage() {
  const navigate = useNavigate();
  const { networks, fetchNetworks } = useIPAMStore();
  const { devices, alerts, fetchDevices, fetchAlerts } = useNPMStore();
  const { targets, benchmarks, fetchTargets, fetchBenchmarks } = useSTIGStore();

  useEffect(() => {
    fetchNetworks();
    fetchDevices();
    fetchAlerts();
    fetchTargets();
    fetchBenchmarks();
  }, [fetchNetworks, fetchDevices, fetchAlerts, fetchTargets, fetchBenchmarks]);

  const activeAlerts = alerts.filter((a: Alert) => a.status === "active");
  const devicesUp = devices.filter((d: Device) => d.status === "up").length;
  const devicesDown = devices.filter((d: Device) => d.status === "down").length;

  // Sample data for charts
  const networkUtilization = [
    { name: "Mon", utilization: 45 },
    { name: "Tue", utilization: 52 },
    { name: "Wed", utilization: 48 },
    { name: "Thu", utilization: 61 },
    { name: "Fri", utilization: 55 },
    { name: "Sat", utilization: 32 },
    { name: "Sun", utilization: 28 },
  ];

  const deviceStatusData = [
    { name: "Up", value: devicesUp || 12, color: "#22c55e" },
    { name: "Down", value: devicesDown || 2, color: "#ef4444" },
    { name: "Warning", value: 3, color: "#f59e0b" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Overview of your network infrastructure
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Networks"
          value={networks.length || 24}
          subtitle="IPAM"
          icon={
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
              />
            </svg>
          }
        />
        <StatsCard
          title="Monitored Devices"
          value={devices.length || 47}
          subtitle="NPM"
          trend={{ value: 5, isPositive: true }}
          icon={
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
              />
            </svg>
          }
        />
        <StatsCard
          title="Active Alerts"
          value={activeAlerts.length || 8}
          subtitle="NPM"
          icon={
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
          }
        />
        <StatsCard
          title="STIG Assets"
          value={targets.length || 15}
          subtitle="Compliance"
          icon={
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          }
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Network Utilization</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart
              data={networkUtilization}
              series={[
                {
                  dataKey: "utilization",
                  name: "Utilization %",
                  color: "#3b82f6",
                },
              ]}
              xAxisKey="name"
              height={250}
              yAxisFormatter={(v) => `${v}%`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Device Status</CardTitle>
          </CardHeader>
          <CardContent>
            <PieChart
              data={deviceStatusData}
              height={250}
              innerRadius={60}
              outerRadius={90}
            />
          </CardContent>
        </Card>
      </div>

      {/* Module Quick Access */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* IPAM Card */}
        <Card
          className="cursor-pointer hover:border-emerald-500 transition-colors"
          onClick={() => navigate("/ipam/networks")}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-400">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                  />
                </svg>
              </span>
              IP Address Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex justify-between">
                <span>Networks</span>
                <span className="font-medium">{networks.length || 24}</span>
              </div>
              <div className="flex justify-between">
                <span>IP Addresses</span>
                <span className="font-medium">2,847</span>
              </div>
              <div className="flex justify-between">
                <span>Utilization</span>
                <span className="font-medium">67%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* NPM Card */}
        <Card
          className="cursor-pointer hover:border-indigo-500 transition-colors"
          onClick={() => navigate("/npm/devices")}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </span>
              Network Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex justify-between">
                <span>Devices Up</span>
                <Badge variant="success">{devicesUp || 42}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Devices Down</span>
                <Badge variant="error">{devicesDown || 2}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Active Alerts</span>
                <Badge variant="warning">{activeAlerts.length || 8}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* STIG Card */}
        <Card
          className="cursor-pointer hover:border-amber-500 transition-colors"
          onClick={() => navigate("/stig/compliance")}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-400">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </span>
              STIG Compliance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex justify-between">
                <span>Total Assets</span>
                <span className="font-medium">{targets.length || 15}</span>
              </div>
              <div className="flex justify-between">
                <span>Benchmarks</span>
                <span className="font-medium">{benchmarks.length || 12}</span>
              </div>
              <div className="flex justify-between">
                <span>Avg. Compliance</span>
                <Badge variant="success">87%</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
