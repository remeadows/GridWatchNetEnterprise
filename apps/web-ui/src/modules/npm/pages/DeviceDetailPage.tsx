import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  StatsCard,
  StatusIndicator,
  LineChart,
  Input,
  Select,
} from "@netnynja/shared-ui";
import { useNPMStore, type PollDeviceResponse } from "../../../stores/npm";
import { useSNMPv3CredentialsStore } from "../../../stores/snmpv3-credentials";
import { useDeviceGroupsStore } from "../../../stores/device-groups";

export function NPMDeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    selectedDevice,
    currentMetrics,
    metricsHistory,
    isLoading,
    fetchDevice,
    fetchCurrentMetrics,
    fetchMetricsHistory,
    deleteDevice,
    pollDevice,
    updateDevice,
  } = useNPMStore();
  const { credentials, fetchCredentials } = useSNMPv3CredentialsStore();
  const { groups, fetchGroups } = useDeviceGroupsStore();

  const [timeRange, setTimeRange] = useState<"1h" | "6h" | "24h" | "7d">("24h");
  const [showPollModal, setShowPollModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [pollMethods, setPollMethods] = useState<{
    icmp: boolean;
    snmp: boolean;
  }>({ icmp: true, snmp: false });
  const [pollResult, setPollResult] = useState<PollDeviceResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [deviceSettings, setDeviceSettings] = useState({
    name: "",
    deviceType: "",
    vendor: "",
    model: "",
    groupId: "",
    pollIcmp: true,
    pollSnmp: false,
    snmpv3CredentialId: "",
    snmpPort: "161",
    pollInterval: "60",
  });

  useEffect(() => {
    if (id) {
      fetchDevice(id);
      fetchCurrentMetrics(id);
    }
    fetchCredentials();
    fetchGroups();
  }, [id, fetchDevice, fetchCurrentMetrics, fetchCredentials, fetchGroups]);

  useEffect(() => {
    if (id) {
      // Calculate time range
      const endTime = new Date();
      let startTime: Date;
      switch (timeRange) {
        case "1h":
          startTime = new Date(endTime.getTime() - 60 * 60 * 1000);
          break;
        case "6h":
          startTime = new Date(endTime.getTime() - 6 * 60 * 60 * 1000);
          break;
        case "24h":
          startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
          break;
        case "7d":
          startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
      }
      fetchMetricsHistory(id, startTime, endTime);
    }
  }, [id, timeRange, fetchMetricsHistory]);

  const handleDelete = async () => {
    if (id && window.confirm("Are you sure you want to delete this device?")) {
      await deleteDevice(id);
      navigate("/npm/devices");
    }
  };

  const openPollModal = () => {
    if (selectedDevice) {
      setPollMethods({
        icmp: selectedDevice.pollIcmp ?? true,
        snmp: selectedDevice.pollSnmp ?? false,
      });
      setPollResult(null);
      setShowPollModal(true);
    }
  };

  const handlePollDevice = async () => {
    if (!id) return;
    const methods: ("icmp" | "snmp")[] = [];
    if (pollMethods.icmp) methods.push("icmp");
    if (pollMethods.snmp) methods.push("snmp");

    if (methods.length === 0) return;

    setIsPolling(true);
    setPollResult(null);
    try {
      const result = await pollDevice(id, methods);
      setPollResult(result);
      // Refresh metrics after poll
      fetchCurrentMetrics(id);
    } catch {
      // Error handled in store
    } finally {
      setIsPolling(false);
    }
  };

  const closePollModal = () => {
    setShowPollModal(false);
    setPollResult(null);
  };

  const openSettingsModal = () => {
    if (selectedDevice) {
      setDeviceSettings({
        name: selectedDevice.name || "",
        deviceType: selectedDevice.deviceType || "",
        vendor: selectedDevice.vendor || "",
        model: selectedDevice.model || "",
        groupId: selectedDevice.groupId || "",
        pollIcmp: selectedDevice.pollIcmp ?? true,
        pollSnmp: selectedDevice.pollSnmp ?? false,
        snmpv3CredentialId: selectedDevice.snmpv3CredentialId || "",
        snmpPort: String(selectedDevice.snmpPort || 161),
        pollInterval: String(selectedDevice.pollInterval || 60),
      });
      setShowSettingsModal(true);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    setIsSavingSettings(true);
    try {
      await updateDevice(id, {
        name: deviceSettings.name,
        deviceType: deviceSettings.deviceType || undefined,
        vendor: deviceSettings.vendor || undefined,
        model: deviceSettings.model || undefined,
        groupId: deviceSettings.groupId || null,
        pollIcmp: deviceSettings.pollIcmp,
        pollSnmp: deviceSettings.pollSnmp,
        snmpv3CredentialId:
          deviceSettings.pollSnmp && deviceSettings.snmpv3CredentialId
            ? deviceSettings.snmpv3CredentialId
            : null,
        snmpPort: parseInt(deviceSettings.snmpPort),
        pollInterval: parseInt(deviceSettings.pollInterval),
      });
      setShowSettingsModal(false);
      // Refresh device data
      fetchDevice(id);
    } catch {
      // Error handled in store
    } finally {
      setIsSavingSettings(false);
    }
  };

  const credentialOptions = [
    { value: "", label: "Select a credential..." },
    ...credentials.map((c) => ({ value: c.id, label: c.name })),
  ];

  const groupOptions = [
    { value: "", label: "No Group" },
    ...groups
      .filter((g) => g.isActive)
      .map((g) => ({ value: g.id, label: g.name })),
  ];

  // Common device types for quick selection
  const deviceTypeOptions = [
    { value: "", label: "Select or type custom..." },
    { value: "Router", label: "Router" },
    { value: "Switch", label: "Switch" },
    { value: "Firewall", label: "Firewall" },
    { value: "Access Point", label: "Access Point" },
    { value: "Server", label: "Server" },
    { value: "Storage", label: "Storage" },
    { value: "Load Balancer", label: "Load Balancer" },
    { value: "UPS", label: "UPS" },
    { value: "PDU", label: "PDU" },
    { value: "Other", label: "Other" },
  ];

  const statusMap = {
    up: "success",
    down: "error",
    warning: "warning",
    unknown: "neutral",
  } as const;

  // Transform metrics history for chart
  const chartData =
    metricsHistory?.metrics.map((m) => ({
      time: new Date(m.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      cpu: m.cpuPercent ?? 0,
      memory: m.memoryPercent ?? 0,
      latency: m.latencyMs ?? 0,
    })) || [];

  // Format bytes to human readable
  const formatBytes = (bytes: number | null): string => {
    if (bytes === null) return "N/A";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  if (!selectedDevice && !isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Device not found</p>
      </div>
    );
  }

  const current = currentMetrics?.current;
  const last24h = currentMetrics?.last24Hours;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/npm/devices")}>
            <svg
              className="mr-2 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back
          </Button>
          <div className="flex items-center gap-3">
            {selectedDevice && (
              <StatusIndicator
                status={statusMap[selectedDevice.status]}
                size="lg"
                pulse={selectedDevice.status === "down"}
              />
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {selectedDevice?.name || "Loading..."}
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                {selectedDevice?.ipAddress}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={openSettingsModal}>
            <svg
              className="mr-2 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Settings
          </Button>
          <Button variant="outline" onClick={openPollModal}>
            <svg
              className="mr-2 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Poll Now
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatsCard
          title="CPU Utilization"
          value={
            current?.cpuPercent !== null && current?.cpuPercent !== undefined
              ? `${current.cpuPercent.toFixed(1)}%`
              : "N/A"
          }
          trend={
            last24h?.avgCpuPercent !== null && current?.cpuPercent !== null
              ? {
                  value: Math.abs(
                    (current?.cpuPercent ?? 0) - (last24h?.avgCpuPercent ?? 0),
                  ),
                  isPositive:
                    (current?.cpuPercent ?? 0) < (last24h?.avgCpuPercent ?? 0),
                }
              : undefined
          }
        />
        <StatsCard
          title="Memory Utilization"
          value={
            current?.memoryPercent !== null &&
            current?.memoryPercent !== undefined
              ? `${current.memoryPercent.toFixed(1)}%`
              : "N/A"
          }
          trend={
            last24h?.avgMemoryPercent !== null &&
            current?.memoryPercent !== null
              ? {
                  value: Math.abs(
                    (current?.memoryPercent ?? 0) -
                      (last24h?.avgMemoryPercent ?? 0),
                  ),
                  isPositive:
                    (current?.memoryPercent ?? 0) <
                    (last24h?.avgMemoryPercent ?? 0),
                }
              : undefined
          }
        />
        <StatsCard
          title="Latency"
          value={
            current?.latencyMs !== null && current?.latencyMs !== undefined
              ? `${current.latencyMs.toFixed(1)} ms`
              : "N/A"
          }
          trend={
            last24h?.avgLatencyMs !== null && current?.latencyMs !== null
              ? {
                  value: Math.abs(
                    (current?.latencyMs ?? 0) - (last24h?.avgLatencyMs ?? 0),
                  ),
                  isPositive:
                    (current?.latencyMs ?? 0) < (last24h?.avgLatencyMs ?? 0),
                }
              : undefined
          }
        />
        <StatsCard
          title="Availability (24h)"
          value={
            last24h?.availabilityPercent !== null &&
            last24h?.availabilityPercent !== undefined
              ? `${last24h.availabilityPercent.toFixed(1)}%`
              : "N/A"
          }
        />
        <StatsCard title="Uptime" value={current?.uptimeFormatted || "N/A"} />
      </div>

      {/* Device Details */}
      <Card>
        <CardHeader>
          <CardTitle>Device Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Device Type
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                {selectedDevice?.deviceType || "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Vendor
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                {selectedDevice?.vendor || "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Model
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                {selectedDevice?.model || "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Poll Interval
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                {selectedDevice?.pollInterval || 60}s
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                ICMP Status
              </dt>
              <dd className="mt-1 flex items-center gap-2">
                <StatusIndicator
                  status={
                    currentMetrics?.icmpStatus === "up" ? "success" : "error"
                  }
                  size="sm"
                />
                <span className="text-sm text-gray-900 dark:text-white">
                  {selectedDevice?.pollIcmp
                    ? currentMetrics?.icmpStatus || "Unknown"
                    : "Disabled"}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                SNMP Status
              </dt>
              <dd className="mt-1 flex items-center gap-2">
                <StatusIndicator
                  status={
                    currentMetrics?.snmpStatus === "up"
                      ? "success"
                      : currentMetrics?.snmpStatus === "unknown"
                        ? "neutral"
                        : "error"
                  }
                  size="sm"
                />
                <span className="text-sm text-gray-900 dark:text-white">
                  {selectedDevice?.pollSnmp
                    ? currentMetrics?.snmpStatus || "Unknown"
                    : "Disabled"}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Memory
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                {current?.memoryUsedBytes !== null &&
                current?.memoryUsedBytes !== undefined
                  ? `${formatBytes(current.memoryUsedBytes)} / ${formatBytes(current.memoryTotalBytes ?? null)}`
                  : "N/A"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Last Poll
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                {currentMetrics?.lastPoll
                  ? new Date(currentMetrics.lastPoll).toLocaleString()
                  : "Never"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Metrics Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Resource Utilization</CardTitle>
          <div className="flex gap-2">
            {(["1h", "6h", "24h", "7d"] as const).map((range) => (
              <Button
                key={range}
                variant={timeRange === range ? "default" : "outline"}
                size="sm"
                onClick={() => setTimeRange(range)}
              >
                {range}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <LineChart
              data={chartData}
              series={[
                { dataKey: "cpu", name: "CPU %", color: "#3b82f6" },
                { dataKey: "memory", name: "Memory %", color: "#10b981" },
              ]}
              xAxisKey="time"
              height={300}
              yAxisFormatter={(v) => `${v}%`}
            />
          ) : (
            <div className="flex h-[300px] items-center justify-center text-gray-500">
              No metrics data available. Start the SNMPv3 collector to begin
              collecting metrics.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Latency Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Latency History</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <LineChart
              data={chartData}
              series={[
                { dataKey: "latency", name: "Latency (ms)", color: "#f59e0b" },
              ]}
              xAxisKey="time"
              height={200}
              yAxisFormatter={(v) => `${v}ms`}
            />
          ) : (
            <div className="flex h-[200px] items-center justify-center text-gray-500">
              No latency data available.
            </div>
          )}
        </CardContent>
      </Card>

      {/* 24-Hour Statistics */}
      {last24h && (
        <Card>
          <CardHeader>
            <CardTitle>24-Hour Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Avg Latency
                </dt>
                <dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {last24h.avgLatencyMs !== null
                    ? `${last24h.avgLatencyMs.toFixed(1)} ms`
                    : "N/A"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Min/Max Latency
                </dt>
                <dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {last24h.minLatencyMs !== null &&
                  last24h.maxLatencyMs !== null
                    ? `${last24h.minLatencyMs.toFixed(1)} / ${last24h.maxLatencyMs.toFixed(1)} ms`
                    : "N/A"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Avg CPU
                </dt>
                <dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {last24h.avgCpuPercent !== null
                    ? `${last24h.avgCpuPercent.toFixed(1)}%`
                    : "N/A"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Avg Memory
                </dt>
                <dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {last24h.avgMemoryPercent !== null
                    ? `${last24h.avgMemoryPercent.toFixed(1)}%`
                    : "N/A"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Total Polls
                </dt>
                <dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {last24h.totalPolls} ({last24h.successfulPolls} successful)
                </dd>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Poll Now Modal */}
      {showPollModal && selectedDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Poll Device Now
              </h2>
              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Device:{" "}
                  <span className="font-medium text-gray-900 dark:text-white">
                    {selectedDevice.name}
                  </span>
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  IP:{" "}
                  <code className="rounded bg-gray-100 px-2 py-0.5 text-sm dark:bg-gray-800">
                    {selectedDevice.ipAddress}
                  </code>
                </p>
              </div>

              {/* Polling Method Selection */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Select Polling Methods
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="pollIcmpDetail"
                      checked={pollMethods.icmp}
                      onChange={(e) =>
                        setPollMethods({
                          ...pollMethods,
                          icmp: e.target.checked,
                        })
                      }
                      disabled={!selectedDevice.pollIcmp || isPolling}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <label
                      htmlFor="pollIcmpDetail"
                      className={`text-sm ${!selectedDevice.pollIcmp ? "text-gray-400" : "text-gray-700 dark:text-gray-300"}`}
                    >
                      Ping (ICMP)
                      {!selectedDevice.pollIcmp && (
                        <span className="ml-2 text-xs text-gray-400">
                          (not enabled)
                        </span>
                      )}
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="pollSnmpDetail"
                      checked={pollMethods.snmp}
                      onChange={(e) =>
                        setPollMethods({
                          ...pollMethods,
                          snmp: e.target.checked,
                        })
                      }
                      disabled={!selectedDevice.pollSnmp || isPolling}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <label
                      htmlFor="pollSnmpDetail"
                      className={`text-sm ${!selectedDevice.pollSnmp ? "text-gray-400" : "text-gray-700 dark:text-gray-300"}`}
                    >
                      SNMPv3
                      {!selectedDevice.pollSnmp && (
                        <span className="ml-2 text-xs text-gray-400">
                          (not enabled)
                        </span>
                      )}
                    </label>
                  </div>
                </div>
                {!pollMethods.icmp && !pollMethods.snmp && (
                  <p className="mt-2 text-xs text-red-600">
                    Select at least one polling method
                  </p>
                )}
              </div>

              {/* Poll Results */}
              {pollResult && (
                <div className="mt-4 border-t pt-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Poll Results
                  </p>
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 space-y-2">
                    {pollResult.results.icmp && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          Ping:
                        </span>
                        {pollResult.results.icmp.success ? (
                          <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                            Success (
                            {pollResult.results.icmp.latencyMs?.toFixed(1)}ms)
                          </span>
                        ) : (
                          <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                            Failed -{" "}
                            {pollResult.results.icmp.error || "Unreachable"}
                          </span>
                        )}
                      </div>
                    )}
                    {pollResult.results.snmp && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          SNMPv3:
                        </span>
                        {pollResult.results.snmp.success ? (
                          <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                            Poll queued
                          </span>
                        ) : (
                          <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                            Failed - {pollResult.results.snmp.error || "Error"}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Device Status:
                      </span>
                      <StatusIndicator
                        status={
                          statusMap[
                            pollResult.deviceStatus
                              .status as keyof typeof statusMap
                          ]
                        }
                        label={pollResult.deviceStatus.status.toUpperCase()}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closePollModal}
                >
                  {pollResult ? "Close" : "Cancel"}
                </Button>
                {!pollResult && (
                  <Button
                    onClick={handlePollDevice}
                    loading={isPolling}
                    disabled={!pollMethods.icmp && !pollMethods.snmp}
                  >
                    <svg
                      className="mr-2 h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Poll Now
                  </Button>
                )}
                {pollResult && (
                  <Button
                    onClick={() => {
                      setPollResult(null);
                      handlePollDevice();
                    }}
                    loading={isPolling}
                    disabled={!pollMethods.icmp && !pollMethods.snmp}
                  >
                    Poll Again
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Device Settings Modal */}
      {showSettingsModal && selectedDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Device Settings
              </h2>
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <Input
                  label="Device Name"
                  value={deviceSettings.name}
                  onChange={(e) =>
                    setDeviceSettings({
                      ...deviceSettings,
                      name: e.target.value,
                    })
                  }
                  placeholder="e.g., Core Router 1"
                  required
                />

                {/* Device Properties Section */}
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Device Properties
                  </p>
                  <div className="space-y-3">
                    <Select
                      label="Device Type"
                      value={
                        deviceTypeOptions.some(
                          (opt) => opt.value === deviceSettings.deviceType,
                        )
                          ? deviceSettings.deviceType
                          : ""
                      }
                      onChange={(e) =>
                        setDeviceSettings({
                          ...deviceSettings,
                          deviceType: e.target.value,
                        })
                      }
                      options={deviceTypeOptions}
                    />
                    {!deviceTypeOptions.some(
                      (opt) => opt.value === deviceSettings.deviceType,
                    ) &&
                      deviceSettings.deviceType && (
                        <p className="text-xs text-silver-400">
                          Current: {deviceSettings.deviceType} (custom type from
                          SNMP)
                        </p>
                      )}
                    <Input
                      label="Vendor"
                      value={deviceSettings.vendor}
                      onChange={(e) =>
                        setDeviceSettings({
                          ...deviceSettings,
                          vendor: e.target.value,
                        })
                      }
                      placeholder="e.g., Cisco, Juniper, Arista"
                    />
                    <Input
                      label="Model"
                      value={deviceSettings.model}
                      onChange={(e) =>
                        setDeviceSettings({
                          ...deviceSettings,
                          model: e.target.value,
                        })
                      }
                      placeholder="e.g., Catalyst 9300, EX4300"
                    />
                    <Select
                      label="Device Group"
                      value={deviceSettings.groupId}
                      onChange={(e) =>
                        setDeviceSettings({
                          ...deviceSettings,
                          groupId: e.target.value,
                        })
                      }
                      options={groupOptions}
                    />
                  </div>
                </div>

                <div className="border-t pt-4 mt-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Polling Methods
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="settingsPollIcmp"
                        checked={deviceSettings.pollIcmp}
                        onChange={(e) =>
                          setDeviceSettings({
                            ...deviceSettings,
                            pollIcmp: e.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label
                        htmlFor="settingsPollIcmp"
                        className="text-sm text-gray-700 dark:text-gray-300"
                      >
                        ICMP Ping (reachability check)
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="settingsPollSnmp"
                        checked={deviceSettings.pollSnmp}
                        onChange={(e) =>
                          setDeviceSettings({
                            ...deviceSettings,
                            pollSnmp: e.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label
                        htmlFor="settingsPollSnmp"
                        className="text-sm text-gray-700 dark:text-gray-300"
                      >
                        SNMPv3 (performance metrics: CPU, memory, interfaces)
                      </label>
                    </div>
                  </div>
                  {!deviceSettings.pollIcmp && !deviceSettings.pollSnmp && (
                    <p className="mt-2 text-xs text-red-600">
                      At least one polling method must be enabled
                    </p>
                  )}
                </div>

                {/* SNMPv3 Settings */}
                {deviceSettings.pollSnmp && (
                  <div className="border-t pt-4 mt-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      SNMPv3 Settings
                    </p>
                    <div className="space-y-3">
                      <Select
                        label="SNMPv3 Credential"
                        value={deviceSettings.snmpv3CredentialId}
                        onChange={(e) =>
                          setDeviceSettings({
                            ...deviceSettings,
                            snmpv3CredentialId: e.target.value,
                          })
                        }
                        options={credentialOptions}
                      />
                      {!deviceSettings.snmpv3CredentialId && (
                        <p className="text-xs text-amber-600">
                          An SNMPv3 credential is required for SNMP polling.{" "}
                          <a
                            href="/npm/credentials"
                            className="underline hover:text-amber-700"
                          >
                            Create one
                          </a>{" "}
                          if you haven't yet.
                        </p>
                      )}
                      <Input
                        label="SNMP Port"
                        type="number"
                        value={deviceSettings.snmpPort}
                        onChange={(e) =>
                          setDeviceSettings({
                            ...deviceSettings,
                            snmpPort: e.target.value,
                          })
                        }
                        placeholder="161"
                      />
                    </div>
                  </div>
                )}

                <div className="border-t pt-4 mt-4">
                  <Input
                    label="Poll Interval (seconds)"
                    type="number"
                    value={deviceSettings.pollInterval}
                    onChange={(e) =>
                      setDeviceSettings({
                        ...deviceSettings,
                        pollInterval: e.target.value,
                      })
                    }
                    placeholder="60"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowSettingsModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    loading={isSavingSettings}
                    disabled={
                      !deviceSettings.name ||
                      (!deviceSettings.pollIcmp && !deviceSettings.pollSnmp) ||
                      (deviceSettings.pollSnmp &&
                        !deviceSettings.snmpv3CredentialId)
                    }
                  >
                    Save Settings
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
