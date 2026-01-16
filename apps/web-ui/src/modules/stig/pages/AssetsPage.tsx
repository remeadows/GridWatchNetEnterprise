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
  { value: "redhat", label: "Red Hat Enterprise Linux" },
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
  { value: "hpe_aruba_cx", label: "HPE Aruba CX" },
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
  { value: "ssh", label: "SSH (Live Connection)" },
  { value: "netmiko", label: "Netmiko (Network Devices)" },
  { value: "winrm", label: "WinRM (Windows)" },
  { value: "api", label: "API" },
  { value: "config", label: "Config File (Offline Analysis)" },
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
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configFile, setConfigFile] = useState<File | null>(null);
  const [configAnalysisResults, setConfigAnalysisResults] = useState<{
    totalChecks: number;
    passed: number;
    failed: number;
    complianceScore: number;
    results: Array<{
      rule_id: string;
      title: string;
      severity: string;
      status: string;
      finding_details: string;
    }>;
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
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

  const openConfigModal = (asset: TargetWithCredential) => {
    setSelectedAsset(asset);
    setConfigFile(null);
    setConfigAnalysisResults(null);
    // Pre-select benchmark that matches platform if available
    const matchingBenchmark = benchmarks.find(
      (b) => b.platform.toLowerCase() === asset.platform.toLowerCase(),
    );
    setSelectedBenchmarkId(matchingBenchmark?.id || "");
    setShowConfigModal(true);
  };

  const handleConfigFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validExtensions = [".txt", ".xml", ".conf", ".cfg"];
      const ext = file.name.toLowerCase().substring(file.name.lastIndexOf("."));
      if (!validExtensions.includes(ext)) {
        alert(`Invalid file type. Supported: ${validExtensions.join(", ")}`);
        return;
      }
      setConfigFile(file);
      setConfigAnalysisResults(null);
    }
  };

  const handleAnalyzeConfig = async () => {
    if (!selectedAsset || !configFile || !selectedBenchmarkId) return;

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("config_file", configFile);
      formData.append("definition_id", selectedBenchmarkId);

      const response = await fetch(
        `/api/v1/stig/targets/${selectedAsset.id}/analyze-config`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Analysis failed");
      }

      const data = await response.json();
      setConfigAnalysisResults({
        totalChecks: data.data.total_checks,
        passed: data.data.summary?.passed || 0,
        failed: data.data.summary?.failed || 0,
        complianceScore: data.data.summary?.compliance_score || 0,
        results: [],
      });

      // Refresh targets to show updated last audit
      fetchTargets();
    } catch (error) {
      alert(
        `Configuration analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsAnalyzing(false);
    }
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
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        openConfigModal(row.original as TargetWithCredential);
                      }}
                      className="border-purple-500 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:border-purple-600 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/40"
                    >
                      Config
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

      {/* Config Analysis Modal */}
      {showConfigModal && selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Configuration File Analysis
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
                </div>

                <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-700 dark:bg-purple-900/20">
                  <p className="text-sm text-purple-700 dark:text-purple-300">
                    Upload a device configuration file (.txt, .xml, .conf, .cfg)
                    to analyze it against the selected STIG benchmark. This does
                    not require a live connection to the device.
                  </p>
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

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Configuration File
                  </label>
                  <input
                    type="file"
                    accept=".txt,.xml,.conf,.cfg"
                    onChange={handleConfigFileChange}
                    className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded file:border-0
                      file:text-sm file:font-semibold
                      file:bg-purple-50 file:text-purple-700
                      hover:file:bg-purple-100
                      dark:text-gray-400
                      dark:file:bg-purple-900/20 dark:file:text-purple-400"
                  />
                  {configFile && (
                    <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                      Selected: {configFile.name} (
                      {(configFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>

                {/* Analysis Results */}
                {configAnalysisResults && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-700 dark:bg-green-900/20">
                      <h3 className="font-semibold text-green-800 dark:text-green-300">
                        Analysis Complete
                      </h3>
                      <div className="mt-2 grid grid-cols-4 gap-4">
                        <div>
                          <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                            {configAnalysisResults.complianceScore.toFixed(1)}%
                          </p>
                          <p className="text-xs text-gray-500">Compliance</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                            {configAnalysisResults.totalChecks}
                          </p>
                          <p className="text-xs text-gray-500">Total Checks</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                            {configAnalysisResults.passed}
                          </p>
                          <p className="text-xs text-gray-500">Passed</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                            {configAnalysisResults.failed}
                          </p>
                          <p className="text-xs text-gray-500">Failed</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowConfigModal(false);
                      setSelectedAsset(null);
                      setSelectedBenchmarkId("");
                      setConfigFile(null);
                      setConfigAnalysisResults(null);
                    }}
                  >
                    Close
                  </Button>
                  <Button
                    onClick={handleAnalyzeConfig}
                    disabled={!selectedBenchmarkId || !configFile || isAnalyzing}
                    loading={isAnalyzing}
                    className="bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-400 dark:bg-purple-600 dark:hover:bg-purple-700"
                  >
                    {isAnalyzing ? "Analyzing..." : "Analyze Configuration"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
