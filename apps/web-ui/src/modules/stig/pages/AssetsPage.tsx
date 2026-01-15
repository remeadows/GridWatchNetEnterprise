import { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  DataTable,
  Badge,
  Input,
  Select,
  StatusIndicator,
} from "@netnynja/shared-ui";
import type { ColumnDef } from "@tanstack/react-table";
import type { Target } from "@netnynja/shared-types";
import { useSTIGStore } from "../../../stores/stig";

// Extended Target type to include credential info from API
interface TargetWithCredential extends Target {
  sshCredentialId?: string | null;
  sshCredentialName?: string | null;
}

const columns: ColumnDef<TargetWithCredential>[] = [
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
    accessorKey: "platform",
    header: "Platform",
    cell: ({ row }) => (
      <Badge variant="secondary">{row.original.platform}</Badge>
    ),
  },
  {
    accessorKey: "connectionType",
    header: "Connection",
    cell: ({ row }) => row.original.connectionType.toUpperCase(),
  },
  {
    accessorKey: "sshCredentialName",
    header: "Credential",
    cell: ({ row }) => (
      <span
        className={
          row.original.sshCredentialName
            ? "text-green-600 dark:text-green-400"
            : "text-gray-400"
        }
      >
        {row.original.sshCredentialName || "None"}
      </span>
    ),
  },
  {
    accessorKey: "isActive",
    header: "Enabled",
    cell: ({ row }) => (
      <StatusIndicator
        status={row.original.isActive ? "success" : "neutral"}
        label={row.original.isActive ? "Enabled" : "Disabled"}
      />
    ),
  },
  {
    accessorKey: "lastAudit",
    header: "Last Audit",
    cell: ({ row }) =>
      row.original.lastAudit
        ? new Date(row.original.lastAudit).toLocaleDateString()
        : "Never",
  },
];

const platformOptions = [
  // Operating Systems
  { value: "linux", label: "Linux" },
  { value: "windows", label: "Windows" },
  { value: "macos", label: "macOS" },
  // Network Devices - Cisco
  { value: "cisco_ios", label: "Cisco IOS" },
  { value: "cisco_nxos", label: "Cisco NX-OS" },
  // Network Devices - Juniper
  { value: "juniper_srx", label: "Juniper SRX" },
  { value: "juniper_junos", label: "Juniper Junos" },
  // Network Devices - Other Vendors
  { value: "arista_eos", label: "Arista EOS" },
  { value: "hp_procurve", label: "HP ProCurve" },
  { value: "mellanox", label: "Mellanox" },
  { value: "pfsense", label: "pfSense" },
  // Firewalls
  { value: "paloalto", label: "Palo Alto" },
  { value: "fortinet", label: "Fortinet" },
  { value: "f5_bigip", label: "F5 BIG-IP" },
  // Virtualization
  { value: "vmware_esxi", label: "VMware ESXi" },
  { value: "vmware_vcenter", label: "VMware vCenter" },
];

const connectionOptions = [
  { value: "ssh", label: "SSH" },
  { value: "netmiko", label: "Netmiko" },
  { value: "winrm", label: "WinRM" },
  { value: "api", label: "API" },
];

export function STIGAssetsPage() {
  const {
    targets,
    benchmarks,
    sshCredentials,
    isLoading,
    fetchTargets,
    fetchBenchmarks,
    fetchSSHCredentials,
    createTarget,
    updateTarget,
    deleteTarget,
  } = useSTIGStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [selectedAsset, setSelectedAsset] =
    useState<TargetWithCredential | null>(null);
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState("");
  const [newTarget, setNewTarget] = useState({
    name: "",
    ipAddress: "",
    platform: "linux",
    connectionType: "ssh",
    port: "",
    sshCredentialId: "",
  });
  const [editTarget, setEditTarget] = useState({
    name: "",
    ipAddress: "",
    platform: "linux",
    connectionType: "ssh",
    port: "",
    sshCredentialId: "",
    isActive: true,
  });

  useEffect(() => {
    fetchTargets();
    fetchSSHCredentials();
    fetchBenchmarks();
  }, [fetchTargets, fetchSSHCredentials, fetchBenchmarks]);

  // Build credential options for select
  const credentialOptions = [
    { value: "", label: "None" },
    ...sshCredentials.map((c) => ({
      value: c.id,
      label: `${c.name} (${c.username})`,
    })),
  ];

  // Build benchmark options for select
  const benchmarkOptions = benchmarks.map((b) => ({
    value: b.id,
    label: `${b.title} (${b.platform})`,
  }));

  const handleAddTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createTarget({
        name: newTarget.name,
        ipAddress: newTarget.ipAddress,
        platform: newTarget.platform as Target["platform"],
        connectionType: newTarget.connectionType as Target["connectionType"],
        port: newTarget.port ? parseInt(newTarget.port) : undefined,
        sshCredentialId: newTarget.sshCredentialId || undefined,
        isActive: true,
      });
      setShowAddModal(false);
      setNewTarget({
        name: "",
        ipAddress: "",
        platform: "linux",
        connectionType: "ssh",
        port: "",
        sshCredentialId: "",
      });
    } catch {
      // Error handled in store
    }
  };

  const openEditModal = (asset: TargetWithCredential) => {
    setSelectedAsset(asset);
    setEditTarget({
      name: asset.name,
      ipAddress: asset.ipAddress,
      platform: asset.platform,
      connectionType: asset.connectionType,
      port: asset.port?.toString() || "",
      sshCredentialId: asset.sshCredentialId || "",
      isActive: asset.isActive,
    });
    setShowEditModal(true);
  };

  const openAuditModal = (asset: TargetWithCredential) => {
    setSelectedAsset(asset);
    // Pre-select benchmark that matches platform if available
    const matchingBenchmark = benchmarks.find(
      (b) => b.platform.toLowerCase() === asset.platform.toLowerCase(),
    );
    setSelectedBenchmarkId(matchingBenchmark?.id || "");
    setShowAuditModal(true);
  };

  const handleEditTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    try {
      await updateTarget(selectedAsset.id, {
        name: editTarget.name,
        ipAddress: editTarget.ipAddress,
        platform: editTarget.platform as Target["platform"],
        connectionType: editTarget.connectionType as Target["connectionType"],
        port: editTarget.port ? parseInt(editTarget.port) : undefined,
        sshCredentialId: editTarget.sshCredentialId || null,
        isActive: editTarget.isActive,
      });
      setShowEditModal(false);
      setSelectedAsset(null);
    } catch {
      // Error handled in store
    }
  };

  const handleStartAudit = async () => {
    if (!selectedAsset || !selectedBenchmarkId) return;
    // For now, show a message - actual audit execution would be via Python service
    alert(
      `Audit requested for ${selectedAsset.name} using benchmark ${selectedBenchmarkId}.\n\nNote: Actual audit execution requires the STIG audit service.`,
    );
    setShowAuditModal(false);
    setSelectedAsset(null);
    setSelectedBenchmarkId("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Assets
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Systems targeted for STIG compliance auditing
          </p>
        </div>
        <Button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Asset
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {targets.filter((t) => t.isActive).length}
          </p>
          <p className="text-sm text-gray-500">Active Assets</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {targets.filter((t) => t.platform === "linux").length}
          </p>
          <p className="text-sm text-gray-500">Linux Systems</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {targets.filter((t) => t.platform === "windows").length}
          </p>
          <p className="text-sm text-gray-500">Windows Systems</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {
              (targets as TargetWithCredential[]).filter(
                (t) => t.sshCredentialId,
              ).length
            }
          </p>
          <p className="text-sm text-gray-500">With Credentials</p>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={[
              ...columns,
              {
                id: "actions",
                header: "Actions",
                cell: ({ row }) => (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(row.original as TargetWithCredential);
                      }}
                      className="border-gray-300 bg-white hover:bg-gray-100 dark:border-gray-500 dark:bg-gray-700 dark:hover:bg-gray-600"
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        openAuditModal(row.original as TargetWithCredential);
                      }}
                      className="border-green-500 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-600 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40"
                    >
                      Audit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm("Delete this asset?")) {
                          deleteTarget(row.original.id);
                        }
                      }}
                      className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </Button>
                  </div>
                ),
              },
            ]}
            data={targets}
            loading={isLoading}
            searchable
            searchPlaceholder="Search assets..."
            emptyMessage="No assets configured. Add your first asset to begin compliance auditing."
          />
        </CardContent>
      </Card>

      {/* Add Asset Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Add Asset
              </h2>
              <form onSubmit={handleAddTarget} className="space-y-4">
                <Input
                  label="Name"
                  value={newTarget.name}
                  onChange={(e) =>
                    setNewTarget({ ...newTarget, name: e.target.value })
                  }
                  placeholder="e.g., Production Web Server"
                  required
                />
                <Input
                  label="IP Address"
                  value={newTarget.ipAddress}
                  onChange={(e) =>
                    setNewTarget({ ...newTarget, ipAddress: e.target.value })
                  }
                  placeholder="e.g., 192.168.1.100"
                  required
                />
                <Select
                  label="Platform"
                  value={newTarget.platform}
                  onChange={(e) =>
                    setNewTarget({ ...newTarget, platform: e.target.value })
                  }
                  options={platformOptions}
                />
                <Select
                  label="Connection Type"
                  value={newTarget.connectionType}
                  onChange={(e) =>
                    setNewTarget({
                      ...newTarget,
                      connectionType: e.target.value,
                    })
                  }
                  options={connectionOptions}
                />
                <Select
                  label="SSH Credential"
                  value={newTarget.sshCredentialId}
                  onChange={(e) =>
                    setNewTarget({
                      ...newTarget,
                      sshCredentialId: e.target.value,
                    })
                  }
                  options={credentialOptions}
                />
                <Input
                  label="Port (optional)"
                  type="number"
                  value={newTarget.port}
                  onChange={(e) =>
                    setNewTarget({ ...newTarget, port: e.target.value })
                  }
                  placeholder="e.g., 22"
                />
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAddModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" loading={isLoading}>
                    Add Asset
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Asset Modal */}
      {showEditModal && selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Edit Asset
              </h2>
              <form onSubmit={handleEditTarget} className="space-y-4">
                <Input
                  label="Name"
                  value={editTarget.name}
                  onChange={(e) =>
                    setEditTarget({ ...editTarget, name: e.target.value })
                  }
                  placeholder="e.g., Production Web Server"
                  required
                />
                <Input
                  label="IP Address"
                  value={editTarget.ipAddress}
                  onChange={(e) =>
                    setEditTarget({ ...editTarget, ipAddress: e.target.value })
                  }
                  placeholder="e.g., 192.168.1.100"
                  required
                />
                <Select
                  label="Platform"
                  value={editTarget.platform}
                  onChange={(e) =>
                    setEditTarget({ ...editTarget, platform: e.target.value })
                  }
                  options={platformOptions}
                />
                <Select
                  label="Connection Type"
                  value={editTarget.connectionType}
                  onChange={(e) =>
                    setEditTarget({
                      ...editTarget,
                      connectionType: e.target.value,
                    })
                  }
                  options={connectionOptions}
                />
                <Select
                  label="SSH Credential"
                  value={editTarget.sshCredentialId}
                  onChange={(e) =>
                    setEditTarget({
                      ...editTarget,
                      sshCredentialId: e.target.value,
                    })
                  }
                  options={credentialOptions}
                />
                <Input
                  label="Port (optional)"
                  type="number"
                  value={editTarget.port}
                  onChange={(e) =>
                    setEditTarget({ ...editTarget, port: e.target.value })
                  }
                  placeholder="e.g., 22"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="editIsActive"
                    checked={editTarget.isActive}
                    onChange={(e) =>
                      setEditTarget({
                        ...editTarget,
                        isActive: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label
                    htmlFor="editIsActive"
                    className="text-sm text-gray-700 dark:text-gray-300"
                  >
                    Enabled (include in audits)
                  </label>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowEditModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" loading={isLoading}>
                    Save Changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Audit Modal - Select Benchmark */}
      {showAuditModal && selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Run STIG Audit
              </h2>
              <div className="space-y-4">
                <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Asset
                  </p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {selectedAsset.name}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {selectedAsset.ipAddress} - {selectedAsset.platform}
                  </p>
                  {selectedAsset.sshCredentialName ? (
                    <p className="mt-1 text-sm text-green-600 dark:text-green-400">
                      Using credential: {selectedAsset.sshCredentialName}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                      No SSH credential assigned
                    </p>
                  )}
                </div>

                {benchmarkOptions.length > 0 ? (
                  <Select
                    label="Select STIG Benchmark"
                    value={selectedBenchmarkId}
                    onChange={(e) => setSelectedBenchmarkId(e.target.value)}
                    options={benchmarkOptions}
                  />
                ) : (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      No STIG benchmarks available. Please upload a STIG
                      benchmark in the Library first.
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowAuditModal(false);
                      setSelectedAsset(null);
                      setSelectedBenchmarkId("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleStartAudit}
                    disabled={
                      !selectedBenchmarkId || !selectedAsset.sshCredentialId
                    }
                    className="bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-400 dark:bg-green-600 dark:hover:bg-green-700"
                  >
                    Start Audit
                  </Button>
                </div>
                {!selectedAsset.sshCredentialId && (
                  <p className="text-center text-sm text-red-500">
                    Please assign an SSH credential to this asset before running
                    an audit.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
