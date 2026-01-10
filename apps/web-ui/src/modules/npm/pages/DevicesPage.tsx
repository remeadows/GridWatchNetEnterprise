import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  CardContent,
  DataTable,
  Input,
  Select,
  StatusIndicator,
  Badge,
} from "@netnynja/shared-ui";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import type { Device } from "@netnynja/shared-types";
import { useNPMStore, type PollDeviceResponse } from "../../../stores/npm";
import { useSNMPv3CredentialsStore } from "../../../stores/snmpv3-credentials";
import { useDeviceGroupsStore } from "../../../stores/device-groups";

const statusMap = {
  up: "success",
  down: "error",
  warning: "warning",
  unknown: "neutral",
} as const;

const getColumns = (
  showGroupColumn: boolean,
  onPollClick: (device: Device, e: React.MouseEvent) => void,
): ColumnDef<Device>[] => {
  const baseColumns: ColumnDef<Device>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllPageRowsSelected()}
          onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={(e) => row.toggleSelected(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium text-gray-900 dark:text-white">
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: "ipAddress",
      header: "IP Address",
      cell: ({ row }) => (
        <code className="rounded bg-gray-100 px-2 py-1 text-sm dark:bg-gray-800">
          {row.original.ipAddress}
        </code>
      ),
    },
    {
      accessorKey: "deviceType",
      header: "Type",
      cell: ({ row }) => row.original.deviceType || "-",
    },
  ];

  if (showGroupColumn) {
    baseColumns.push({
      accessorKey: "groupName",
      header: "Group",
      cell: ({ row }) => {
        const groupName = row.original.groupName;
        const groupColor = row.original.groupColor || "#6366f1";
        if (!groupName) return <span className="text-gray-400">-</span>;
        return (
          <span
            className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium"
            style={{ backgroundColor: `${groupColor}20`, color: groupColor }}
          >
            {groupName}
          </span>
        );
      },
    });
  }

  baseColumns.push(
    {
      accessorKey: "pollingMethods",
      header: "Polling",
      cell: ({ row }) => {
        const methods = [];
        if (row.original.pollIcmp) methods.push("ICMP");
        if (row.original.pollSnmp) methods.push("SNMPv3");
        return (
          <div className="flex gap-1">
            {methods.map((method) => (
              <Badge key={method} variant="secondary" className="text-xs">
                {method}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusIndicator
          status={statusMap[row.original.status]}
          label={row.original.status.toUpperCase()}
          pulse={row.original.status === "down"}
        />
      ),
    },
    {
      accessorKey: "lastPoll",
      header: "Last Poll",
      cell: ({ row }) =>
        row.original.lastPoll
          ? new Date(row.original.lastPoll).toLocaleString()
          : "Never",
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <button
          onClick={(e) => onPollClick(row.original, e)}
          className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors"
          title="Poll Now"
        >
          <svg
            className="h-3.5 w-3.5"
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
          Poll
        </button>
      ),
    },
  );

  return baseColumns;
};

export function NPMDevicesPage() {
  const navigate = useNavigate();
  const {
    devices,
    isLoading,
    fetchDevices,
    createDevice,
    pollDevice,
    pollerStatus,
    fetchPollerStatus,
  } = useNPMStore();
  const { credentials, fetchCredentials } = useSNMPv3CredentialsStore();
  const {
    groups,
    fetchGroups,
    createGroup,
    assignDevicesToGroup,
    removeDevicesFromGroup,
  } = useDeviceGroupsStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollTargetDevice, setPollTargetDevice] = useState<Device | null>(null);
  const [pollMethods, setPollMethods] = useState<{
    icmp: boolean;
    snmp: boolean;
  }>({ icmp: true, snmp: false });
  const [pollResult, setPollResult] = useState<PollDeviceResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  const [newGroup, setNewGroup] = useState({
    name: "",
    description: "",
    color: "#6366f1",
  });
  const [selectedGroupForAssign, setSelectedGroupForAssign] = useState("");
  const [newDevice, setNewDevice] = useState({
    name: "",
    ipAddress: "",
    deviceType: "",
    vendor: "",
    groupId: "",
    pollIcmp: true,
    pollSnmp: false,
    snmpv3CredentialId: "",
    snmpPort: "161",
    pollInterval: "60",
  });

  useEffect(() => {
    fetchDevices();
    fetchCredentials();
    fetchGroups();
    fetchPollerStatus();
    // Refresh poller status every 30 seconds
    const pollerInterval = setInterval(fetchPollerStatus, 30000);
    return () => clearInterval(pollerInterval);
  }, [fetchDevices, fetchCredentials, fetchGroups, fetchPollerStatus]);

  // Filter devices by group
  const filteredDevices =
    selectedGroupFilter === "ungrouped"
      ? devices.filter((d) => !d.groupId)
      : selectedGroupFilter
        ? devices.filter((d) => d.groupId === selectedGroupFilter)
        : devices;

  // Group devices by their group for collapsed view
  const devicesByGroup = useMemo(() => {
    const grouped = new Map<string | null, Device[]>();

    // Initialize with all active groups (even if empty)
    groups
      .filter((g) => g.isActive)
      .forEach((g) => {
        grouped.set(g.id, []);
      });
    // Add ungrouped category
    grouped.set(null, []);

    // Distribute devices to their groups
    devices.forEach((device) => {
      const groupId = device.groupId || null;
      const existing = grouped.get(groupId) || [];
      grouped.set(groupId, [...existing, device]);
    });

    return grouped;
  }, [devices, groups]);

  // Toggle group collapse
  const toggleGroupCollapse = (groupId: string | null) => {
    const key = groupId || "ungrouped";
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Expand/collapse all groups
  const expandAllGroups = () => setCollapsedGroups(new Set());
  const collapseAllGroups = () => {
    const allGroupIds = groups.map((g) => g.id);
    allGroupIds.push("ungrouped");
    setCollapsedGroups(new Set(allGroupIds));
  };

  // Get selected device IDs
  // With getRowId={(row) => row.id}, the rowSelection keys are the actual device IDs
  const selectedDeviceIds = Object.keys(rowSelection).filter(
    (key) => rowSelection[key],
  );

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createGroup(newGroup);
      setShowGroupModal(false);
      setNewGroup({ name: "", description: "", color: "#6366f1" });
    } catch {
      // Error handled in store
    }
  };

  const handleAssignToGroup = async () => {
    if (!selectedGroupForAssign || selectedDeviceIds.length === 0) return;
    try {
      await assignDevicesToGroup(selectedGroupForAssign, selectedDeviceIds);
      setShowAssignModal(false);
      setSelectedGroupForAssign("");
      setRowSelection({});
      fetchDevices(); // Refresh devices to show updated groups
    } catch {
      // Error handled in store
    }
  };

  const handleRemoveFromGroup = async () => {
    if (selectedDeviceIds.length === 0) return;
    // Get the group IDs of selected devices (they might be in different groups)
    const devicesByGroup = new Map<string, string[]>();
    selectedDeviceIds.forEach((deviceId) => {
      const device = filteredDevices.find((d) => d.id === deviceId);
      if (device?.groupId) {
        const existing = devicesByGroup.get(device.groupId) || [];
        devicesByGroup.set(device.groupId, [...existing, deviceId]);
      }
    });

    try {
      for (const [groupId, deviceIds] of devicesByGroup) {
        await removeDevicesFromGroup(groupId, deviceIds);
      }
      setRowSelection({});
      fetchDevices();
    } catch {
      // Error handled in store
    }
  };

  const openPollModal = (device: Device, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setPollTargetDevice(device);
    setPollMethods({
      icmp: device.pollIcmp ?? true,
      snmp: device.pollSnmp ?? false,
    });
    setPollResult(null);
    setShowPollModal(true);
  };

  const handlePollDevice = async () => {
    if (!pollTargetDevice) return;
    const methods: ("icmp" | "snmp")[] = [];
    if (pollMethods.icmp) methods.push("icmp");
    if (pollMethods.snmp) methods.push("snmp");

    if (methods.length === 0) return;

    setIsPolling(true);
    setPollResult(null);
    try {
      const result = await pollDevice(pollTargetDevice.id, methods);
      setPollResult(result);
    } catch {
      // Error handled in store
    } finally {
      setIsPolling(false);
    }
  };

  const closePollModal = () => {
    setShowPollModal(false);
    setPollTargetDevice(null);
    setPollResult(null);
    setPollMethods({ icmp: true, snmp: false });
  };

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createDevice({
        name: newDevice.name,
        ipAddress: newDevice.ipAddress,
        deviceType: newDevice.deviceType || undefined,
        vendor: newDevice.vendor || undefined,
        groupId: newDevice.groupId || undefined,
        pollIcmp: newDevice.pollIcmp,
        pollSnmp: newDevice.pollSnmp,
        snmpv3CredentialId:
          newDevice.pollSnmp && newDevice.snmpv3CredentialId
            ? newDevice.snmpv3CredentialId
            : undefined,
        snmpPort: parseInt(newDevice.snmpPort),
        pollInterval: parseInt(newDevice.pollInterval),
        isActive: true,
        sshEnabled: false,
      });
      setShowAddModal(false);
      setNewDevice({
        name: "",
        ipAddress: "",
        deviceType: "",
        vendor: "",
        groupId: "",
        pollIcmp: true,
        pollSnmp: false,
        snmpv3CredentialId: "",
        snmpPort: "161",
        pollInterval: "60",
      });
    } catch {
      // Error handled in store
    }
  };

  const credentialOptions = [
    { value: "", label: "Select a credential..." },
    ...credentials.map((c) => ({ value: c.id, label: c.name })),
  ];

  const groupOptions = [
    { value: "", label: "All Groups" },
    { value: "ungrouped", label: "Ungrouped" },
    ...groups.map((g) => ({ value: g.id, label: g.name })),
  ];

  const groupSelectOptions = [
    { value: "", label: "Select a group..." },
    ...groups.map((g) => ({ value: g.id, label: g.name })),
  ];

  const columns = getColumns(
    !selectedGroupFilter || selectedGroupFilter === "ungrouped",
    openPollModal,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Devices
            </h1>
            {pollerStatus && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  pollerStatus.isRunning
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                }`}
                title={`Poll interval: ${Math.round(pollerStatus.config.defaultIntervalMs / 60000)} min | Cycles: ${pollerStatus.pollCycleCount} | Active: ${pollerStatus.activePolls}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    pollerStatus.isRunning
                      ? "bg-green-500 animate-pulse"
                      : "bg-gray-400"
                  }`}
                />
                {pollerStatus.isRunning ? "Auto-Polling" : "Poller Stopped"}
              </span>
            )}
          </div>
          <p className="text-gray-500 dark:text-gray-400">
            Monitor your network devices
            {pollerStatus?.isRunning && (
              <span className="text-xs ml-2">
                (every{" "}
                {Math.round(pollerStatus.config.defaultIntervalMs / 60000)} min)
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowGroupModal(true)}>
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
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            New Group
          </Button>
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
            Add Device
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <StatusIndicator status="success" size="lg" />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {devices.filter((d) => d.status === "up").length}
              </p>
              <p className="text-sm text-gray-500">Devices Up</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <StatusIndicator status="error" size="lg" pulse />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {devices.filter((d) => d.status === "down").length}
              </p>
              <p className="text-sm text-gray-500">Devices Down</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <StatusIndicator status="warning" size="lg" />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {devices.filter((d) => d.status === "warning").length}
              </p>
              <p className="text-sm text-gray-500">Warnings</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <StatusIndicator status="neutral" size="lg" />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {devices.length}
              </p>
              <p className="text-sm text-gray-500">Total Devices</p>
            </div>
          </div>
        </Card>
      </div>

      {/* View Mode Toggle and Bulk Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 rounded-lg bg-dark-800 p-1">
            <button
              onClick={() => setViewMode("grouped")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === "grouped"
                  ? "bg-primary-600 text-white"
                  : "text-silver-400 hover:text-silver-200"
              }`}
            >
              Grouped
            </button>
            <button
              onClick={() => setViewMode("flat")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === "flat"
                  ? "bg-primary-600 text-white"
                  : "text-silver-400 hover:text-silver-200"
              }`}
            >
              Flat List
            </button>
          </div>

          {viewMode === "grouped" && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={expandAllGroups}>
                Expand All
              </Button>
              <Button size="sm" variant="ghost" onClick={collapseAllGroups}>
                Collapse All
              </Button>
            </div>
          )}

          {viewMode === "flat" && (
            <div className="w-64">
              <Select
                label=""
                value={selectedGroupFilter}
                onChange={(e) => {
                  setSelectedGroupFilter(e.target.value);
                  setRowSelection({});
                }}
                options={groupOptions}
              />
            </div>
          )}
        </div>

        {selectedDeviceIds.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-silver-400">
              {selectedDeviceIds.length} device(s) selected
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAssignModal(true)}
            >
              Assign to Group
            </Button>
            <Button size="sm" variant="outline" onClick={handleRemoveFromGroup}>
              Remove from Group
            </Button>
          </div>
        )}
      </div>

      {/* Grouped View */}
      {viewMode === "grouped" && (
        <div className="space-y-4">
          {/* Render each group as a collapsible block */}
          {Array.from(devicesByGroup.entries()).map(
            ([groupId, groupDevices]) => {
              const group = groups.find((g) => g.id === groupId);
              const groupKey = groupId || "ungrouped";
              const isCollapsed = collapsedGroups.has(groupKey);
              const groupColor = group?.color || "#6b7280";
              const groupName = group?.name || "Ungrouped Devices";
              const upCount = groupDevices.filter(
                (d) => d.status === "up",
              ).length;
              const downCount = groupDevices.filter(
                (d) => d.status === "down",
              ).length;

              return (
                <Card key={groupKey} className="overflow-hidden">
                  {/* Collapsible Header */}
                  <button
                    onClick={() => toggleGroupCollapse(groupId)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-dark-800/50 transition-colors"
                    style={{ borderLeft: `4px solid ${groupColor}` }}
                  >
                    <div className="flex items-center gap-3">
                      <svg
                        className={`h-5 w-5 text-silver-400 transition-transform ${
                          isCollapsed ? "" : "rotate-90"
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: groupColor }}
                      />
                      <span className="font-semibold text-silver-100">
                        {groupName}
                      </span>
                      <Badge variant="default">
                        {groupDevices.length} devices
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      {upCount > 0 && (
                        <span className="flex items-center gap-1 text-sm text-green-400">
                          <span className="h-2 w-2 rounded-full bg-green-400" />
                          {upCount} up
                        </span>
                      )}
                      {downCount > 0 && (
                        <span className="flex items-center gap-1 text-sm text-red-400">
                          <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
                          {downCount} down
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {!isCollapsed && (
                    <CardContent className="pt-0 pb-4">
                      {groupDevices.length > 0 ? (
                        <DataTable
                          columns={columns}
                          data={groupDevices}
                          loading={isLoading}
                          searchable
                          searchPlaceholder="Search devices in group..."
                          onRowClick={(device) =>
                            navigate(`/npm/devices/${device.id}`)
                          }
                          emptyMessage="No devices in this group."
                          rowSelection={rowSelection}
                          onRowSelectionChange={setRowSelection}
                          getRowId={(row) => row.id}
                        />
                      ) : (
                        <div className="py-8 text-center text-silver-400">
                          No devices in this group. Add devices or assign
                          existing devices to this group.
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            },
          )}
        </div>
      )}

      {/* Flat List View */}
      {viewMode === "flat" && (
        <Card>
          <CardContent className="pt-6">
            <DataTable
              columns={columns}
              data={filteredDevices}
              loading={isLoading}
              searchable
              searchPlaceholder="Search devices..."
              onRowClick={(device) => navigate(`/npm/devices/${device.id}`)}
              emptyMessage="No devices found. Add your first device to start monitoring."
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              getRowId={(row) => row.id}
            />
          </CardContent>
        </Card>
      )}

      {/* Add Device Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Add Device
              </h2>
              <form onSubmit={handleAddDevice} className="space-y-4">
                <Input
                  label="Name"
                  value={newDevice.name}
                  onChange={(e) =>
                    setNewDevice({ ...newDevice, name: e.target.value })
                  }
                  placeholder="e.g., Core Router 1"
                  required
                />
                <Input
                  label="IP Address"
                  value={newDevice.ipAddress}
                  onChange={(e) =>
                    setNewDevice({ ...newDevice, ipAddress: e.target.value })
                  }
                  placeholder="e.g., 192.168.1.1"
                  required
                />
                <Input
                  label="Device Type"
                  value={newDevice.deviceType}
                  onChange={(e) =>
                    setNewDevice({ ...newDevice, deviceType: e.target.value })
                  }
                  placeholder="e.g., Router, Switch"
                />
                <Input
                  label="Vendor"
                  value={newDevice.vendor}
                  onChange={(e) =>
                    setNewDevice({ ...newDevice, vendor: e.target.value })
                  }
                  placeholder="e.g., Cisco, Juniper"
                />
                <Select
                  label="Device Group"
                  value={newDevice.groupId}
                  onChange={(e) =>
                    setNewDevice({ ...newDevice, groupId: e.target.value })
                  }
                  options={groupSelectOptions}
                />

                {/* Polling Methods */}
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Polling Methods
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="pollIcmp"
                        checked={newDevice.pollIcmp}
                        onChange={(e) =>
                          setNewDevice({
                            ...newDevice,
                            pollIcmp: e.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label
                        htmlFor="pollIcmp"
                        className="text-sm text-gray-700 dark:text-gray-300"
                      >
                        ICMP Ping (reachability check)
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="pollSnmp"
                        checked={newDevice.pollSnmp}
                        onChange={(e) =>
                          setNewDevice({
                            ...newDevice,
                            pollSnmp: e.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label
                        htmlFor="pollSnmp"
                        className="text-sm text-gray-700 dark:text-gray-300"
                      >
                        SNMPv3 (performance metrics)
                      </label>
                    </div>
                  </div>
                  {!newDevice.pollIcmp && !newDevice.pollSnmp && (
                    <p className="mt-2 text-xs text-red-600">
                      At least one polling method must be enabled
                    </p>
                  )}
                </div>

                {/* SNMPv3 Settings */}
                {newDevice.pollSnmp && (
                  <div className="border-t pt-4 mt-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      SNMPv3 Settings
                    </p>
                    <div className="space-y-3">
                      <Select
                        label="SNMPv3 Credential"
                        value={newDevice.snmpv3CredentialId}
                        onChange={(e) =>
                          setNewDevice({
                            ...newDevice,
                            snmpv3CredentialId: e.target.value,
                          })
                        }
                        options={credentialOptions}
                      />
                      {!newDevice.snmpv3CredentialId && (
                        <p className="text-xs text-amber-600">
                          An SNMPv3 credential is required for SNMP polling.{" "}
                          <a href="/npm/credentials" className="underline">
                            Create one
                          </a>{" "}
                          if you haven't yet.
                        </p>
                      )}
                      <Input
                        label="SNMP Port"
                        type="number"
                        value={newDevice.snmpPort}
                        onChange={(e) =>
                          setNewDevice({
                            ...newDevice,
                            snmpPort: e.target.value,
                          })
                        }
                        placeholder="161"
                      />
                    </div>
                  </div>
                )}

                <Input
                  label="Poll Interval (seconds)"
                  type="number"
                  value={newDevice.pollInterval}
                  onChange={(e) =>
                    setNewDevice({ ...newDevice, pollInterval: e.target.value })
                  }
                  placeholder="60"
                />
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAddModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    loading={isLoading}
                    disabled={
                      !newDevice.name ||
                      !newDevice.ipAddress ||
                      (!newDevice.pollIcmp && !newDevice.pollSnmp) ||
                      (newDevice.pollSnmp && !newDevice.snmpv3CredentialId)
                    }
                  >
                    Add Device
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Group Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Create Device Group
              </h2>
              <form onSubmit={handleCreateGroup} className="space-y-4">
                <Input
                  label="Group Name"
                  value={newGroup.name}
                  onChange={(e) =>
                    setNewGroup({ ...newGroup, name: e.target.value })
                  }
                  placeholder="e.g., Core Network, Branch Office"
                  required
                />
                <Input
                  label="Description"
                  value={newGroup.description}
                  onChange={(e) =>
                    setNewGroup({ ...newGroup, description: e.target.value })
                  }
                  placeholder="Optional description"
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newGroup.color}
                      onChange={(e) =>
                        setNewGroup({ ...newGroup, color: e.target.value })
                      }
                      className="h-10 w-20 rounded border border-gray-300 cursor-pointer"
                    />
                    <span
                      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: `${newGroup.color}20`,
                        color: newGroup.color,
                      }}
                    >
                      Preview
                    </span>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowGroupModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    loading={isLoading}
                    disabled={!newGroup.name}
                  >
                    Create Group
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Assign to Group Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Assign Devices to Group
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Assign {selectedDeviceIds.length} selected device(s) to a group.
              </p>
              <Select
                label="Select Group"
                value={selectedGroupForAssign}
                onChange={(e) => setSelectedGroupForAssign(e.target.value)}
                options={groupSelectOptions}
              />
              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedGroupForAssign("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAssignToGroup}
                  loading={isLoading}
                  disabled={!selectedGroupForAssign}
                >
                  Assign to Group
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Poll Now Modal */}
      {showPollModal && pollTargetDevice && (
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
                    {pollTargetDevice.name}
                  </span>
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  IP:{" "}
                  <code className="rounded bg-gray-100 px-2 py-0.5 text-sm dark:bg-gray-800">
                    {pollTargetDevice.ipAddress}
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
                      id="pollIcmpNow"
                      checked={pollMethods.icmp}
                      onChange={(e) =>
                        setPollMethods({
                          ...pollMethods,
                          icmp: e.target.checked,
                        })
                      }
                      disabled={!pollTargetDevice.pollIcmp || isPolling}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <label
                      htmlFor="pollIcmpNow"
                      className={`text-sm ${!pollTargetDevice.pollIcmp ? "text-gray-400" : "text-gray-700 dark:text-gray-300"}`}
                    >
                      Ping (ICMP)
                      {!pollTargetDevice.pollIcmp && (
                        <span className="ml-2 text-xs text-gray-400">
                          (not enabled for this device)
                        </span>
                      )}
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="pollSnmpNow"
                      checked={pollMethods.snmp}
                      onChange={(e) =>
                        setPollMethods({
                          ...pollMethods,
                          snmp: e.target.checked,
                        })
                      }
                      disabled={!pollTargetDevice.pollSnmp || isPolling}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <label
                      htmlFor="pollSnmpNow"
                      className={`text-sm ${!pollTargetDevice.pollSnmp ? "text-gray-400" : "text-gray-700 dark:text-gray-300"}`}
                    >
                      SNMPv3
                      {!pollTargetDevice.pollSnmp && (
                        <span className="ml-2 text-xs text-gray-400">
                          (not enabled for this device)
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
    </div>
  );
}
