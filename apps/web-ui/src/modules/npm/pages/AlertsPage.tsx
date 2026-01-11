import { useEffect } from "react";
import {
  Button,
  Card,
  CardContent,
  DataTable,
  Badge,
} from "@netnynja/shared-ui";
import type { ColumnDef } from "@tanstack/react-table";
import type { Alert } from "@netnynja/shared-types";
import { useNPMStore } from "../../../stores/npm";

const severityColors = {
  info: "secondary",
  warning: "warning",
  critical: "error",
} as const;

const statusColors = {
  active: "error",
  acknowledged: "warning",
  resolved: "success",
} as const;

const columns: ColumnDef<Alert>[] = [
  {
    accessorKey: "severity",
    header: "Severity",
    cell: ({ row }) => (
      <Badge variant={severityColors[row.original.severity]}>
        {row.original.severity.toUpperCase()}
      </Badge>
    ),
  },
  {
    accessorKey: "message",
    header: "Message",
    cell: ({ row }) => (
      <span className="font-medium text-gray-900 dark:text-white">
        {row.original.message}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={statusColors[row.original.status]}>
        {row.original.status.charAt(0).toUpperCase() +
          row.original.status.slice(1)}
      </Badge>
    ),
  },
  {
    accessorKey: "triggeredAt",
    header: "Triggered",
    cell: ({ row }) => new Date(row.original.triggeredAt).toLocaleString(),
  },
  {
    accessorKey: "acknowledgedAt",
    header: "Acknowledged",
    cell: ({ row }) =>
      row.original.acknowledgedAt
        ? new Date(row.original.acknowledgedAt).toLocaleString()
        : "-",
  },
];

export function NPMAlertsPage() {
  const { alerts, isLoading, fetchAlerts, acknowledgeAlert } = useNPMStore();

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const activeAlerts = alerts.filter((a: Alert) => a.status === "active");
  const acknowledgedAlerts = alerts.filter(
    (a: Alert) => a.status === "acknowledged",
  );
  const criticalAlerts = alerts.filter(
    (a: Alert) => a.severity === "critical" && a.status === "active",
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Alerts
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Monitor and manage network alerts
          </p>
        </div>
        <Button variant="outline" onClick={() => fetchAlerts()}>
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
          Refresh
        </Button>
      </div>

      {/* Alert Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="border-l-4 border-l-error-500 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Critical Alerts
          </p>
          <p className="text-3xl font-bold text-error-600">
            {criticalAlerts.length}
          </p>
        </Card>
        <Card className="border-l-4 border-l-warning-500 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Active Alerts
          </p>
          <p className="text-3xl font-bold text-warning-600">
            {activeAlerts.length}
          </p>
        </Card>
        <Card className="border-l-4 border-l-info-500 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Acknowledged
          </p>
          <p className="text-3xl font-bold text-info-600">
            {acknowledgedAlerts.length}
          </p>
        </Card>
        <Card className="border-l-4 border-l-success-500 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Total Alerts
          </p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {alerts.length}
          </p>
        </Card>
      </div>

      {/* Active Alerts */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            All Alerts
          </h2>
          <DataTable
            columns={[
              ...columns,
              {
                id: "actions",
                header: "Actions",
                cell: ({ row }) =>
                  row.original.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        acknowledgeAlert(row.original.id);
                      }}
                    >
                      Acknowledge
                    </Button>
                  ),
              },
            ]}
            data={alerts}
            loading={isLoading}
            searchable
            searchPlaceholder="Search alerts..."
            emptyMessage="No alerts at this time."
          />
        </CardContent>
      </Card>
    </div>
  );
}
