import { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Input,
  StatusIndicator,
} from "@netnynja/shared-ui";
import { useSyslogStore, SyslogSource } from "../../../stores/syslog";

export function SyslogSourcesPage() {
  const {
    sources,
    bufferSettings,
    isLoading,
    fetchSources,
    fetchBufferSettings,
    createSource,
    updateSource,
    deleteSource,
  } = useSyslogStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editSource, setEditSource] = useState<SyslogSource | null>(null);
  const [newSource, setNewSource] = useState<{
    name: string;
    ipAddress: string;
    port: string;
    protocol: "udp" | "tcp" | "tls";
    hostname: string;
    deviceType: string;
  }>({
    name: "",
    ipAddress: "",
    port: "514",
    protocol: "udp",
    hostname: "",
    deviceType: "",
  });

  useEffect(() => {
    fetchSources();
    fetchBufferSettings();
  }, [fetchSources, fetchBufferSettings]);

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSource({
        name: newSource.name,
        ipAddress: newSource.ipAddress,
        port: parseInt(newSource.port, 10),
        protocol: newSource.protocol,
        hostname: newSource.hostname || undefined,
        deviceType: newSource.deviceType || undefined,
        isActive: true,
      });
      setShowAddModal(false);
      setNewSource({
        name: "",
        ipAddress: "",
        port: "514",
        protocol: "udp",
        hostname: "",
        deviceType: "",
      });
    } catch (error) {
      console.error("Failed to create source:", error);
    }
  };

  const handleEditSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSource) return;
    try {
      await updateSource(editSource.id, {
        name: editSource.name,
        ipAddress: editSource.ipAddress,
        port: editSource.port,
        protocol: editSource.protocol,
        hostname: editSource.hostname || undefined,
        deviceType: editSource.deviceType || undefined,
        isActive: editSource.isActive,
      });
      setEditSource(null);
    } catch (error) {
      console.error("Failed to update source:", error);
    }
  };

  const handleDeleteSource = async (id: string) => {
    if (!confirm("Are you sure you want to delete this source?")) return;
    try {
      await deleteSource(id);
    } catch (error) {
      console.error("Failed to delete source:", error);
    }
  };

  const handleToggleActive = async (source: SyslogSource) => {
    try {
      await updateSource(source.id, { isActive: !source.isActive });
    } catch (error) {
      console.error("Failed to toggle source status:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Syslog Sources
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Configure devices sending syslog events
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
          Add Source
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {sources.length}
          </p>
          <p className="text-sm text-gray-500">Total Sources</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-green-600">
            {sources.filter((s) => s.isActive).length}
          </p>
          <p className="text-sm text-gray-500">Active</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {sources
              .reduce((acc, s) => acc + s.eventsReceived, 0)
              .toLocaleString()}
          </p>
          <p className="text-sm text-gray-500">Events Received</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {sources.filter((s) => s.protocol === "tls").length}
          </p>
          <p className="text-sm text-gray-500">TLS Encrypted</p>
        </Card>
      </div>

      {/* Buffer Status */}
      {bufferSettings && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">
                Buffer Status
              </h3>
              <p className="text-sm text-gray-500">
                {bufferSettings.currentSizeGb.toFixed(2)} GB /{" "}
                {bufferSettings.maxSizeGb} GB used
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {bufferSettings.usagePercent.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-500">
                Retention: {bufferSettings.retentionDays} days
              </p>
            </div>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className={`h-2 rounded-full ${
                bufferSettings.usagePercent > 90
                  ? "bg-red-500"
                  : bufferSettings.usagePercent > 70
                    ? "bg-amber-500"
                    : "bg-green-500"
              }`}
              style={{
                width: `${Math.min(bufferSettings.usagePercent, 100)}%`,
              }}
            />
          </div>
        </Card>
      )}

      {/* Sources List */}
      <Card>
        <CardHeader>
          <CardTitle>Configured Sources</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && sources.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              Loading sources...
            </div>
          ) : sources.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              No sources configured. Add a source to start receiving syslog
              events.
            </div>
          ) : (
            <div className="space-y-4">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                >
                  <div className="flex items-center gap-4">
                    <StatusIndicator
                      status={source.isActive ? "success" : "neutral"}
                      label={source.isActive ? "Active" : "Inactive"}
                    />
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-white">
                        {source.name}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
                          {source.ipAddress}:{source.port}
                        </code>
                        <Badge
                          variant={
                            source.protocol === "tls" ? "success" : "secondary"
                          }
                        >
                          {source.protocol.toUpperCase()}
                        </Badge>
                        {source.deviceType && (
                          <span className="text-xs">{source.deviceType}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {source.eventsReceived.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">events received</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-900 dark:text-white">
                        {source.lastEventAt
                          ? new Date(source.lastEventAt).toLocaleTimeString()
                          : "Never"}
                      </p>
                      <p className="text-xs text-gray-500">last event</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(source)}
                      >
                        {source.isActive ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditSource(source)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                        onClick={() => handleDeleteSource(source.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Source Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Add Syslog Source
              </h2>
              <form onSubmit={handleAddSource} className="space-y-4">
                <Input
                  label="Name"
                  value={newSource.name}
                  onChange={(e) =>
                    setNewSource({ ...newSource, name: e.target.value })
                  }
                  placeholder="e.g., Core Firewall"
                  required
                />
                <Input
                  label="IP Address"
                  value={newSource.ipAddress}
                  onChange={(e) =>
                    setNewSource({ ...newSource, ipAddress: e.target.value })
                  }
                  placeholder="e.g., 10.0.0.1"
                  required
                />
                <Input
                  label="Port"
                  type="number"
                  value={newSource.port}
                  onChange={(e) =>
                    setNewSource({ ...newSource, port: e.target.value })
                  }
                  placeholder="514"
                />
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Protocol
                  </label>
                  <select
                    value={newSource.protocol}
                    onChange={(e) =>
                      setNewSource({
                        ...newSource,
                        protocol: e.target.value as "udp" | "tcp" | "tls",
                      })
                    }
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="udp">UDP (Standard)</option>
                    <option value="tcp">TCP (Reliable)</option>
                    <option value="tls">TLS (Encrypted)</option>
                  </select>
                </div>
                <Input
                  label="Device Type (optional)"
                  value={newSource.deviceType}
                  onChange={(e) =>
                    setNewSource({ ...newSource, deviceType: e.target.value })
                  }
                  placeholder="e.g., cisco, linux, windows"
                />
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAddModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    Add Source
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Source Modal */}
      {editSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Edit Syslog Source
              </h2>
              <form onSubmit={handleEditSource} className="space-y-4">
                <Input
                  label="Name"
                  value={editSource.name}
                  onChange={(e) =>
                    setEditSource({ ...editSource, name: e.target.value })
                  }
                  required
                />
                <Input
                  label="IP Address"
                  value={editSource.ipAddress}
                  onChange={(e) =>
                    setEditSource({ ...editSource, ipAddress: e.target.value })
                  }
                  required
                />
                <Input
                  label="Port"
                  type="number"
                  value={editSource.port.toString()}
                  onChange={(e) =>
                    setEditSource({
                      ...editSource,
                      port: parseInt(e.target.value, 10),
                    })
                  }
                />
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Protocol
                  </label>
                  <select
                    value={editSource.protocol}
                    onChange={(e) =>
                      setEditSource({
                        ...editSource,
                        protocol: e.target.value as "udp" | "tcp" | "tls",
                      })
                    }
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="udp">UDP (Standard)</option>
                    <option value="tcp">TCP (Reliable)</option>
                    <option value="tls">TLS (Encrypted)</option>
                  </select>
                </div>
                <Input
                  label="Device Type"
                  value={editSource.deviceType || ""}
                  onChange={(e) =>
                    setEditSource({ ...editSource, deviceType: e.target.value })
                  }
                />
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="editActive"
                    checked={editSource.isActive}
                    onChange={(e) =>
                      setEditSource({
                        ...editSource,
                        isActive: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label
                    htmlFor="editActive"
                    className="text-sm text-gray-700 dark:text-gray-300"
                  >
                    Active
                  </label>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditSource(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    Save Changes
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
