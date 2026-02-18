import { useState, useEffect } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  DataTable,
  Input,
  Badge,
} from "@gridwatch/shared-ui";
import type { ColumnDef } from "@tanstack/react-table";
import {
  useDeviceGroupsStore,
  type DeviceGroup,
  type CreateDeviceGroupInput,
  type UpdateDeviceGroupInput,
} from "../../../stores/device-groups";

export function DeviceGroupsPage() {
  const {
    groups,
    isLoading,
    error,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
  } = useDeviceGroupsStore();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<DeviceGroup | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [newGroup, setNewGroup] = useState<CreateDeviceGroupInput>({
    name: "",
    description: "",
    color: "#00d4ff",
  });

  const [editGroup, setEditGroup] = useState<UpdateDeviceGroupInput>({});

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createGroup(newGroup);
      setIsCreateModalOpen(false);
      resetNewGroup();
    } catch {
      // Error is handled in store
    }
  };

  const handleEditGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;
    try {
      await updateGroup(selectedGroup.id, editGroup);
      setIsEditModalOpen(false);
      setSelectedGroup(null);
    } catch {
      // Error is handled in store
    }
  };

  const handleDeleteGroup = async (group: DeviceGroup) => {
    if (
      window.confirm(
        `Are you sure you want to delete group "${group.name}"? Devices in this group will become ungrouped.`,
      )
    ) {
      try {
        await deleteGroup(group.id);
      } catch {
        // Error is handled in store
      }
    }
  };

  const resetNewGroup = () => {
    setNewGroup({
      name: "",
      description: "",
      color: "#00d4ff",
    });
  };

  const openEditModal = (group: DeviceGroup) => {
    setSelectedGroup(group);
    setEditGroup({
      name: group.name,
      description: group.description || "",
      color: group.color,
      isActive: group.isActive,
    });
    setIsEditModalOpen(true);
  };

  // Filter groups based on search
  const filteredGroups = searchQuery
    ? groups.filter(
        (g) =>
          g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          g.description?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : groups;

  const columns: ColumnDef<DeviceGroup>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div
            className="h-4 w-4 rounded-full"
            style={{ backgroundColor: row.original.color }}
          />
          <span className="font-medium text-silver-100">
            {row.original.name}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="text-silver-400">
          {row.original.description || "-"}
        </span>
      ),
    },
    {
      accessorKey: "deviceCount",
      header: "Devices",
      cell: ({ row }) => (
        <Badge variant="default">{row.original.deviceCount}</Badge>
      ),
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "success" : "warning"}>
          {row.original.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) =>
        new Date(row.original.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEditModal(row.original)}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-error-400 hover:text-error-300"
            onClick={() => handleDeleteGroup(row.original)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-silver-100">Device Groups</h1>
          <p className="text-silver-400">
            Organize your network devices into logical groups
          </p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
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
          New Group
        </Button>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-md border border-error-500/50 bg-error-900/20 p-4 text-error-400">
          {error}
        </div>
      )}

      {/* Groups Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Groups ({filteredGroups.length})</CardTitle>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search groups..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredGroups}
            loading={isLoading}
            emptyMessage="No device groups found. Create one to get started."
          />
        </CardContent>
      </Card>

      {/* Create Group Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-dark-700 bg-dark-800 p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-silver-100">
              Create Device Group
            </h2>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-silver-300">
                  Name *
                </label>
                <Input
                  value={newGroup.name}
                  onChange={(e) =>
                    setNewGroup({ ...newGroup, name: e.target.value })
                  }
                  placeholder="e.g., Core Routers"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-silver-300">
                  Description
                </label>
                <Input
                  value={newGroup.description || ""}
                  onChange={(e) =>
                    setNewGroup({ ...newGroup, description: e.target.value })
                  }
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-silver-300">
                  Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={newGroup.color}
                    onChange={(e) =>
                      setNewGroup({ ...newGroup, color: e.target.value })
                    }
                    className="h-10 w-16 cursor-pointer rounded border border-dark-600 bg-dark-800"
                  />
                  <Input
                    value={newGroup.color}
                    onChange={(e) =>
                      setNewGroup({ ...newGroup, color: e.target.value })
                    }
                    placeholder="#00d4ff"
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    resetNewGroup();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading || !newGroup.name}>
                  Create Group
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Group Modal */}
      {isEditModalOpen && selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-dark-700 bg-dark-800 p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-silver-100">
              Edit Device Group
            </h2>
            <form onSubmit={handleEditGroup} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-silver-300">
                  Name *
                </label>
                <Input
                  value={editGroup.name || ""}
                  onChange={(e) =>
                    setEditGroup({ ...editGroup, name: e.target.value })
                  }
                  placeholder="e.g., Core Routers"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-silver-300">
                  Description
                </label>
                <Input
                  value={editGroup.description || ""}
                  onChange={(e) =>
                    setEditGroup({ ...editGroup, description: e.target.value })
                  }
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-silver-300">
                  Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={editGroup.color || "#00d4ff"}
                    onChange={(e) =>
                      setEditGroup({ ...editGroup, color: e.target.value })
                    }
                    className="h-10 w-16 cursor-pointer rounded border border-dark-600 bg-dark-800"
                  />
                  <Input
                    value={editGroup.color || ""}
                    onChange={(e) =>
                      setEditGroup({ ...editGroup, color: e.target.value })
                    }
                    placeholder="#00d4ff"
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={editGroup.isActive ?? true}
                  onChange={(e) =>
                    setEditGroup({ ...editGroup, isActive: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-dark-600 bg-dark-800 text-primary-500"
                />
                <label
                  htmlFor="isActive"
                  className="text-sm font-medium text-silver-300"
                >
                  Active
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSelectedGroup(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading || !editGroup.name}>
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
