import { useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Input,
} from "@netnynja/shared-ui";

interface SyslogFilter {
  id: string;
  name: string;
  description: string;
  criteria: {
    severity?: string[];
    facility?: string[];
    hostname?: string;
    messagePattern?: string;
  };
  action: "alert" | "drop" | "forward" | "tag";
  isActive: boolean;
  matchCount: number;
}

// Mock data
const mockFilters: SyslogFilter[] = [
  {
    id: "1",
    name: "Critical Security Events",
    description: "Alert on critical security-related events",
    criteria: {
      severity: ["emergency", "alert", "critical"],
      facility: ["auth", "authpriv"],
    },
    action: "alert",
    isActive: true,
    matchCount: 156,
  },
  {
    id: "2",
    name: "Network Device Errors",
    description: "Track network infrastructure errors",
    criteria: {
      severity: ["error", "critical"],
      facility: ["local0", "local7"],
    },
    action: "tag",
    isActive: true,
    matchCount: 432,
  },
  {
    id: "3",
    name: "Debug Messages",
    description: "Drop debug messages in production",
    criteria: {
      severity: ["debug"],
    },
    action: "drop",
    isActive: true,
    matchCount: 8921,
  },
  {
    id: "4",
    name: "Forward to SIEM",
    description: "Forward high-priority events to external SIEM",
    criteria: {
      severity: ["emergency", "alert", "critical", "error"],
    },
    action: "forward",
    isActive: false,
    matchCount: 0,
  },
];

const actionColors: Record<
  SyslogFilter["action"],
  "error" | "warning" | "default" | "success"
> = {
  alert: "error",
  drop: "default",
  forward: "success",
  tag: "warning",
};

export function SyslogFiltersPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFilter, setNewFilter] = useState({
    name: "",
    description: "",
    action: "alert",
  });

  const handleAddFilter = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, this would call the API
    console.log("Adding filter:", newFilter);
    setShowAddModal(false);
    setNewFilter({ name: "", description: "", action: "alert" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Syslog Filters
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Configure event filtering and routing rules
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Filter
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {mockFilters.length}
          </p>
          <p className="text-sm text-gray-500">Total Filters</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-green-600">
            {mockFilters.filter((f) => f.isActive).length}
          </p>
          <p className="text-sm text-gray-500">Active</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {mockFilters
              .reduce((acc, f) => acc + f.matchCount, 0)
              .toLocaleString()}
          </p>
          <p className="text-sm text-gray-500">Total Matches</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-red-600">
            {mockFilters.filter((f) => f.action === "alert").length}
          </p>
          <p className="text-sm text-gray-500">Alert Rules</p>
        </Card>
      </div>

      {/* Filters List */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Rules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockFilters.map((filter) => (
              <div
                key={filter.id}
                className={`rounded-lg border p-4 ${
                  filter.isActive
                    ? "border-gray-200 dark:border-gray-700"
                    : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={filter.isActive}
                      onChange={() => {}}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {filter.name}
                        </h3>
                        <Badge variant={actionColors[filter.action]}>
                          {filter.action.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        {filter.description}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {filter.criteria.severity && (
                          <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            Severity: {filter.criteria.severity.join(", ")}
                          </span>
                        )}
                        {filter.criteria.facility && (
                          <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            Facility: {filter.criteria.facility.join(", ")}
                          </span>
                        )}
                        {filter.criteria.hostname && (
                          <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            Host: {filter.criteria.hostname}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {filter.matchCount.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">matches</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add Filter Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-lg">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Add Filter Rule
              </h2>
              <form onSubmit={handleAddFilter} className="space-y-4">
                <Input
                  label="Name"
                  value={newFilter.name}
                  onChange={(e) =>
                    setNewFilter({ ...newFilter, name: e.target.value })
                  }
                  placeholder="e.g., Critical Security Events"
                  required
                />
                <Input
                  label="Description"
                  value={newFilter.description}
                  onChange={(e) =>
                    setNewFilter({ ...newFilter, description: e.target.value })
                  }
                  placeholder="Describe what this filter does"
                />
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Action
                  </label>
                  <select
                    value={newFilter.action}
                    onChange={(e) =>
                      setNewFilter({ ...newFilter, action: e.target.value })
                    }
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="alert">Alert - Send notification</option>
                    <option value="tag">Tag - Add label to event</option>
                    <option value="forward">
                      Forward - Send to external system
                    </option>
                    <option value="drop">Drop - Discard event</option>
                  </select>
                </div>
                <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
                  <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Criteria (configured in edit mode)
                  </p>
                  <p className="text-xs text-gray-500">
                    After creating the filter, you can configure severity
                    levels, facilities, hostname patterns, and message patterns.
                  </p>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAddModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Create Filter</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
