import { useEffect, useState } from "react";
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
import { useNPMStore } from "../../../stores/npm";
import { useSNMPv3CredentialsStore } from "../../../stores/snmpv3-credentials";
import { useDeviceGroupsStore } from "../../../stores/device-groups";

const statusMap = {
  up: "success",
  down: "error",
  warning: "warning",
  unknown: "neutral",
} as const;

// Extended device type that includes group info
interface DeviceWithGroup extends Device {
  groupId?: string | null;
  groupName?: string | null;
  groupColor?: string | null;
}

const getColumns = (showGroupColumn: boolean): ColumnDef<DeviceWithGroup>[] => {
  const baseColumns: ColumnDef<DeviceWithGroup>[] = [
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
  );

  return baseColumns;
};

export function NPMDevicesPage() {
  const navigate = useNavigate();
  const { devices, isLoading, fetchDevices, createDevice } = useNPMStore();
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
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
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
  }, [fetchDevices, fetchCredentials, fetchGroups]);

  // Filter devices by group
  const filteredDevices =
    selectedGroupFilter === "ungrouped"
      ? (devices as DeviceWithGroup[]).filter((d) => !d.groupId)
      : selectedGroupFilter
        ? (devices as DeviceWithGroup[]).filter(
            (d) => d.groupId === selectedGroupFilter,
          )
        : (devices as DeviceWithGroup[]);

  // Get selected device IDs
  const selectedDeviceIds = Object.keys(rowSelection)
    .filter((key) => rowSelection[key])
    .map((index) => filteredDevices[parseInt(index)]?.id)
    .filter(Boolean) as string[];

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
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Devices
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Monitor your network devices
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

      {/* Group Filter and Bulk Actions */}
      <div className="flex items-center gap-4">
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
        {selectedDeviceIds.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
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
        {/* Show active groups as badges */}
        <div className="flex flex-wrap gap-2">
          {groups.slice(0, 5).map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGroupFilter(g.id)}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedGroupFilter === g.id
                  ? "ring-2 ring-offset-2"
                  : "hover:opacity-80"
              }`}
              style={{ backgroundColor: `${g.color}20`, color: g.color }}
            >
              {g.name} ({g.deviceCount})
            </button>
          ))}
        </div>
      </div>

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
          />
        </CardContent>
      </Card>

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
    </div>
  );
}
