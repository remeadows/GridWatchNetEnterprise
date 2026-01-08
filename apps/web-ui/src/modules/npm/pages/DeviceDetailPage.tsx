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
} from "@netnynja/shared-ui";
import { useNPMStore } from "../../../stores/npm";

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
  } = useNPMStore();

  const [timeRange, setTimeRange] = useState<"1h" | "6h" | "24h" | "7d">("24h");

  useEffect(() => {
    if (id) {
      fetchDevice(id);
      fetchCurrentMetrics(id);
    }
  }, [id, fetchDevice, fetchCurrentMetrics]);

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
          <Button variant="outline">
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
    </div>
  );
}
