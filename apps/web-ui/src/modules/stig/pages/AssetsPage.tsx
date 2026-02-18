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
} from "@gridwatch/shared-ui";
import type { ColumnDef } from "@tanstack/react-table";
import type { Target } from "@gridwatch/shared-types";
import { useSTIGStore, type TargetDefinition, type AuditGroup } from "../../../stores/stig";
import { api } from "../../../lib/api";

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

type EditTab = "general" | "connection" | "stigs";

export function STIGAssetsPage() {
  const {
    targets,
    benchmarks,
    sshCredentials,
    targetDefinitions,
    isLoading,
    fetchTargets,
    fetchBenchmarks,
    fetchSSHCredentials,
    fetchTargetDefinitions,
    createTarget,
    updateTarget,
    deleteTarget,
    assignSTIG,
    updateAssignment,
    removeAssignment,
    startAuditAll,
  } = useSTIGStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showAddSTIGModal, setShowAddSTIGModal] = useState(false);
  const [showAuditAllModal, setShowAuditAllModal] = useState(false);
  const [editTab, setEditTab] = useState<EditTab>("general");
  const [configFile, setConfigFile] = useState<File | null>(null);
  const [configAnalysisResults, setConfigAnalysisResults] = useState<{
    jobIds: string[];  // All job IDs from multi-STIG analysis
    jobId: string;     // Last job ID (for backwards compatibility)
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
  const [auditAllResult, setAuditAllResult] = useState<AuditGroup | null>(null);
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

  // Filter benchmarks by platform for suggestions
  const getCompatibleBenchmarks = (platform: string) => {
    return benchmarks.filter((b) => {
      const platformLower = platform.toLowerCase();
      const benchmarkPlatform = b.platform.toLowerCase();
      // Match by platform prefix or exact match
      return (
        benchmarkPlatform.includes(platformLower) ||
        platformLower.includes(benchmarkPlatform) ||
        // Handle common mappings
        (platformLower === "juniper_srx" && benchmarkPlatform.includes("juniper")) ||
        (platformLower === "juniper_junos" && benchmarkPlatform.includes("juniper")) ||
        (platformLower === "cisco_ios" && benchmarkPlatform.includes("cisco")) ||
        (platformLower === "redhat" && benchmarkPlatform.includes("rhel")) ||
        (platformLower === "linux" && benchmarkPlatform.includes("linux"))
      );
    });
  };

  // Get benchmarks not yet assigned to the target
  const getUnassignedBenchmarks = () => {
    if (!selectedAsset) return [];
    const assignedIds = new Set(targetDefinitions.map((td) => td.definitionId));
    return benchmarks.filter((b) => !assignedIds.has(b.id));
  };

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

  const openEditModal = async (asset: TargetWithCredential) => {
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
    setEditTab("general");
    setShowEditModal(true);
    // Fetch assigned STIGs for this target
    try {
      await fetchTargetDefinitions(asset.id, true);
    } catch {
      // Error handled in store
    }
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
    try {
      const { startAudit } = useSTIGStore.getState();
      const auditJob = await startAudit(selectedAsset.id, selectedBenchmarkId);
      setShowAuditModal(false);
      setSelectedAsset(null);
      setSelectedBenchmarkId("");
      alert(
        `Audit started successfully!\n\nJob ID: ${auditJob.id}\nStatus: ${auditJob.status}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start audit";
      alert(`Error starting audit: ${message}`);
    }
  };

  const openConfigModal = async (asset: TargetWithCredential) => {
    setSelectedAsset(asset);
    setConfigFile(null);
    setConfigAnalysisResults(null);
    setShowConfigModal(true);

    // Fetch assigned STIGs for this asset and auto-select one
    try {
      await fetchTargetDefinitions(asset.id, true);
      // After fetch, targetDefinitions will be updated - we'll use them in the modal
    } catch {
      // Error handled in store
    }

    // Pre-select the first enabled assigned STIG, or fall back to platform match
    // Note: targetDefinitions state may not be updated yet, so we also handle this in the modal render
    const matchingBenchmark = benchmarks.find(
      (b) => b.platform.toLowerCase() === asset.platform.toLowerCase(),
    );
    setSelectedBenchmarkId(matchingBenchmark?.id || "");
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
    if (!selectedAsset || !configFile) return;

    // Use assigned STIGs if available, otherwise use selected benchmark
    const enabledDefinitions = targetDefinitions.filter((td) => td.enabled);
    const definitionsToAnalyze = enabledDefinitions.length > 0
      ? enabledDefinitions.map((td) => ({ id: td.definitionId, title: td.stigTitle }))
      : selectedBenchmarkId
        ? [{ id: selectedBenchmarkId, title: "Selected Benchmark" }]
        : [];

    if (definitionsToAnalyze.length === 0) return;

    setIsAnalyzing(true);
    try {
      // Read file content once for reuse
      const fileContent = await configFile.arrayBuffer();

      // Aggregate results from all STIGs
      let totalChecks = 0;
      let totalPassed = 0;
      let totalFailed = 0;
      const allJobIds: string[] = [];

      // Analyze against each enabled STIG
      for (const def of definitionsToAnalyze) {
        const formData = new FormData();
        // Create a new Blob from the content for each request
        formData.append("config_file", new Blob([fileContent]), configFile.name);
        formData.append("definition_id", def.id);

        const response = await api.post(
          `/api/v1/stig/targets/${selectedAsset.id}/analyze-config`,
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
            },
          },
        );

        const data = response.data;
        totalChecks += data.data.total_checks || 0;
        totalPassed += data.data.summary?.passed || 0;
        totalFailed += data.data.summary?.failed || 0;
        allJobIds.push(data.data.job_id);
      }

      // Calculate overall compliance score
      const applicableChecks = totalPassed + totalFailed;
      const overallScore = applicableChecks > 0
        ? (totalPassed / applicableChecks) * 100
        : 0;

      setConfigAnalysisResults({
        jobIds: allJobIds,
        jobId: allJobIds[allJobIds.length - 1] || "", // Last job ID for backwards compatibility
        totalChecks,
        passed: totalPassed,
        failed: totalFailed,
        complianceScore: overallScore,
        results: [],
      });

      // Refresh targets to show updated last audit
      fetchTargets();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`Configuration analysis failed: ${message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // STIG-13: Handle adding a STIG assignment
  const handleAddSTIG = async (definitionId: string, isPrimary: boolean) => {
    if (!selectedAsset) return;
    try {
      await assignSTIG(selectedAsset.id, definitionId, isPrimary);
      setShowAddSTIGModal(false);
    } catch {
      // Error handled in store
    }
  };

  // STIG-13: Handle toggling primary
  const handleTogglePrimary = async (assignment: TargetDefinition) => {
    if (!selectedAsset) return;
    try {
      await updateAssignment(selectedAsset.id, assignment.id, {
        isPrimary: !assignment.isPrimary,
      });
    } catch {
      // Error handled in store
    }
  };

  // STIG-13: Handle toggling enabled
  const handleToggleEnabled = async (assignment: TargetDefinition) => {
    if (!selectedAsset) return;
    try {
      await updateAssignment(selectedAsset.id, assignment.id, {
        enabled: !assignment.enabled,
      });
    } catch {
      // Error handled in store
    }
  };

  // STIG-13: Handle removing assignment
  const handleRemoveAssignment = async (assignment: TargetDefinition) => {
    if (!selectedAsset) return;
    if (!window.confirm(`Remove "${assignment.stigTitle}" from this asset?`)) return;
    try {
      await removeAssignment(selectedAsset.id, assignment.id);
    } catch {
      // Error handled in store
    }
  };

  // STIG-13: Handle Audit All
  const openAuditAllModal = async (asset: TargetWithCredential) => {
    setSelectedAsset(asset);
    setAuditAllResult(null);
    setShowAuditAllModal(true);
    // Fetch assigned STIGs for this target
    try {
      await fetchTargetDefinitions(asset.id, true);
    } catch {
      // Error handled in store
    }
  };

  const handleStartAuditAll = async () => {
    if (!selectedAsset) return;
    const enabledDefinitions = targetDefinitions.filter((td) => td.enabled);
    if (enabledDefinitions.length === 0) {
      alert("No enabled STIG definitions to audit. Please assign STIGs to this asset first.");
      return;
    }
    try {
      const result = await startAuditAll(selectedAsset.id);
      setAuditAllResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start audits";
      alert(`Error: ${message}`);
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
                        openAuditAllModal(row.original as TargetWithCredential);
                      }}
                      className="border-indigo-500 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/40"
                      title="Audit All assigned STIGs"
                    >
                      All
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

      {/* Edit Asset Modal (Tabbed) */}
      {showEditModal && selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Edit Asset: {selectedAsset.name}
              </h2>

              {/* Tabs */}
              <div className="mb-6 flex border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setEditTab("general")}
                  className={`px-4 py-2 text-sm font-medium ${
                    editTab === "general"
                      ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  }`}
                >
                  General
                </button>
                <button
                  onClick={() => setEditTab("connection")}
                  className={`px-4 py-2 text-sm font-medium ${
                    editTab === "connection"
                      ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  }`}
                >
                  Connection
                </button>
                <button
                  onClick={() => setEditTab("stigs")}
                  className={`px-4 py-2 text-sm font-medium ${
                    editTab === "stigs"
                      ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  }`}
                >
                  STIGs ({targetDefinitions.length})
                </button>
              </div>

              {/* General Tab */}
              {editTab === "general" && (
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
              )}

              {/* Connection Tab */}
              {editTab === "connection" && (
                <form onSubmit={handleEditTarget} className="space-y-4">
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
              )}

              {/* STIGs Tab */}
              {editTab === "stigs" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Assigned STIG definitions for compliance auditing
                    </p>
                    <Button
                      size="sm"
                      onClick={() => setShowAddSTIGModal(true)}
                      className="bg-blue-600 text-white hover:bg-blue-700"
                    >
                      <svg
                        className="mr-1 h-4 w-4"
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
                      Add STIG
                    </Button>
                  </div>

                  {/* Compatible STIGs suggestion */}
                  {targetDefinitions.length === 0 && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-700 dark:bg-blue-900/20">
                      <p className="mb-2 text-sm font-medium text-blue-800 dark:text-blue-300">
                        Suggested STIGs for {selectedAsset.platform}:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {getCompatibleBenchmarks(selectedAsset.platform).slice(0, 5).map((b) => (
                          <button
                            key={b.id}
                            onClick={() => handleAddSTIG(b.id, targetDefinitions.length === 0)}
                            className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 hover:bg-blue-200 dark:bg-blue-800 dark:text-blue-300 dark:hover:bg-blue-700"
                          >
                            + {b.title}
                          </button>
                        ))}
                        {getCompatibleBenchmarks(selectedAsset.platform).length === 0 && (
                          <span className="text-sm text-blue-600 dark:text-blue-400">
                            No matching STIGs found. Upload STIGs in the Library.
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Assigned STIGs list */}
                  <div className="space-y-2">
                    {targetDefinitions.map((assignment) => (
                      <div
                        key={assignment.id}
                        className={`rounded-lg border p-4 ${
                          assignment.enabled
                            ? "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
                            : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={assignment.enabled}
                                onChange={() => handleToggleEnabled(assignment)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span
                                className={`font-medium ${
                                  assignment.enabled
                                    ? "text-gray-900 dark:text-white"
                                    : "text-gray-500 dark:text-gray-400"
                                }`}
                              >
                                {assignment.stigTitle || "Unknown STIG"}
                              </span>
                              {assignment.isPrimary && (
                                <Badge variant="default" className="bg-yellow-500 text-white">
                                  Primary
                                </Badge>
                              )}
                              {!assignment.enabled && (
                                <Badge variant="secondary">Disabled</Badge>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                              {assignment.rulesCount || 0} rules
                              {assignment.complianceScore !== null && assignment.complianceScore !== undefined && (
                                <> | <span className={assignment.complianceScore >= 80 ? "text-green-600" : assignment.complianceScore >= 50 ? "text-yellow-600" : "text-red-600"}>
                                  {assignment.complianceScore.toFixed(1)}% compliant
                                </span></>
                              )}
                              {assignment.lastAuditDate && (
                                <> | Last audit: {new Date(assignment.lastAuditDate).toLocaleDateString()}</>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleTogglePrimary(assignment)}
                              className={`p-1 ${
                                assignment.isPrimary
                                  ? "text-yellow-500"
                                  : "text-gray-400 hover:text-yellow-500"
                              }`}
                              title={assignment.isPrimary ? "Primary STIG" : "Set as primary"}
                            >
                              <svg className="h-5 w-5" fill={assignment.isPrimary ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleRemoveAssignment(assignment)}
                              className="p-1 text-gray-400 hover:text-red-500"
                              title="Remove STIG"
                            >
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {targetDefinitions.length === 0 && (
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
                      No STIGs assigned. Click "Add STIG" to assign compliance benchmarks.
                    </p>
                  )}

                  <div className="flex justify-end gap-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowEditModal(false)}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add STIG Modal */}
      {showAddSTIGModal && selectedAsset && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Add STIG to {selectedAsset.name}
              </h2>
              <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                Platform: {selectedAsset.platform}
              </p>

              {/* Compatible STIGs section */}
              {getCompatibleBenchmarks(selectedAsset.platform).length > 0 && (
                <div className="mb-6">
                  <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Compatible STIGs
                  </h3>
                  <div className="space-y-2">
                    {getCompatibleBenchmarks(selectedAsset.platform)
                      .filter((b) => !targetDefinitions.some((td) => td.definitionId === b.id))
                      .map((benchmark) => (
                        <button
                          key={benchmark.id}
                          onClick={() => handleAddSTIG(benchmark.id, targetDefinitions.length === 0)}
                          className="w-full rounded-lg border border-gray-200 p-3 text-left hover:border-blue-500 hover:bg-blue-50 dark:border-gray-700 dark:hover:border-blue-500 dark:hover:bg-blue-900/20"
                        >
                          <p className="font-medium text-gray-900 dark:text-white">
                            {benchmark.title}
                          </p>
                          <p className="text-sm text-gray-500">
                            {benchmark.platform} | Version {benchmark.version}
                          </p>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* All other STIGs */}
              <div>
                <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  All Available STIGs
                </h3>
                <div className="max-h-60 space-y-2 overflow-y-auto">
                  {getUnassignedBenchmarks().map((benchmark) => (
                    <button
                      key={benchmark.id}
                      onClick={() => handleAddSTIG(benchmark.id, targetDefinitions.length === 0)}
                      className="w-full rounded-lg border border-gray-200 p-3 text-left hover:border-blue-500 hover:bg-blue-50 dark:border-gray-700 dark:hover:border-blue-500 dark:hover:bg-blue-900/20"
                    >
                      <p className="font-medium text-gray-900 dark:text-white">
                        {benchmark.title}
                      </p>
                      <p className="text-sm text-gray-500">
                        {benchmark.platform} | Version {benchmark.version}
                      </p>
                    </button>
                  ))}
                  {getUnassignedBenchmarks().length === 0 && (
                    <p className="py-4 text-center text-sm text-gray-500">
                      All available STIGs are already assigned.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddSTIGModal(false)}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Audit All Modal */}
      {showAuditAllModal && selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Audit All STIGs
              </h2>

              <div className="mb-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
                <p className="font-medium text-gray-900 dark:text-white">
                  {selectedAsset.name}
                </p>
                <p className="text-sm text-gray-500">
                  {selectedAsset.ipAddress} - {selectedAsset.platform}
                </p>
              </div>

              {!auditAllResult ? (
                <>
                  <div className="mb-4">
                    <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Enabled STIGs to Audit ({targetDefinitions.filter((td) => td.enabled).length})
                    </h3>
                    <div className="space-y-2">
                      {targetDefinitions
                        .filter((td) => td.enabled)
                        .map((td) => (
                          <div
                            key={td.id}
                            className="flex items-center justify-between rounded border border-gray-200 p-2 dark:border-gray-700"
                          >
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {td.stigTitle}
                            </span>
                            <span className="text-xs text-gray-500">
                              {td.rulesCount} rules
                            </span>
                          </div>
                        ))}
                      {targetDefinitions.filter((td) => td.enabled).length === 0 && (
                        <p className="py-4 text-center text-sm text-gray-500">
                          No enabled STIGs assigned. Edit the asset to add STIGs.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowAuditAllModal(false);
                        setAuditAllResult(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleStartAuditAll}
                      disabled={targetDefinitions.filter((td) => td.enabled).length === 0}
                      loading={isLoading}
                      className="bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      Start All Audits
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-700 dark:bg-green-900/20">
                    <h3 className="font-semibold text-green-800 dark:text-green-300">
                      Audits Started Successfully
                    </h3>
                    <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                      Group ID: {auditAllResult.id}
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-400">
                      Total Jobs: {auditAllResult.totalJobs}
                    </p>
                  </div>

                  {auditAllResult.jobs && auditAllResult.jobs.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        Audit Jobs:
                      </h4>
                      <div className="space-y-1">
                        {auditAllResult.jobs.map((job) => (
                          <div
                            key={job.id}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="text-gray-700 dark:text-gray-300">
                              {job.stigTitle}
                            </span>
                            <Badge
                              variant={
                                job.status === "completed"
                                  ? "default"
                                  : job.status === "running"
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {job.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowAuditAllModal(false);
                        setAuditAllResult(null);
                      }}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Single Audit Modal - Select Benchmark */}
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
                    to analyze it against {targetDefinitions.filter((td) => td.enabled).length > 0
                      ? "the assigned STIGs"
                      : "the selected STIG benchmark"}. This does
                    not require a live connection to the device.
                  </p>
                </div>

                {/* Show assigned STIGs if available, otherwise show dropdown */}
                {targetDefinitions.filter((td) => td.enabled).length > 0 ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Assigned STIGs (will analyze against all enabled)
                    </label>
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-700 dark:bg-green-900/20">
                      <div className="space-y-1">
                        {targetDefinitions
                          .filter((td) => td.enabled)
                          .map((td) => (
                            <div key={td.id} className="flex items-center gap-2 text-sm">
                              <span className="text-green-600 dark:text-green-400">✓</span>
                              <span className="text-gray-700 dark:text-gray-300">{td.stigTitle}</span>
                              <span className="text-xs text-gray-500">({td.rulesCount} rules)</span>
                            </div>
                          ))}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      The configuration will be analyzed against all enabled STIGs listed above.
                    </p>
                  </div>
                ) : benchmarkOptions.length > 0 ? (
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

                      {/* Download Buttons */}
                      <div className="mt-4 flex gap-3">
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              // Use combined report endpoint if multiple jobs
                              const jobIds = configAnalysisResults.jobIds || [configAnalysisResults.jobId];
                              const endpoint = jobIds.length > 1
                                ? `/api/v1/stig/reports/combined-pdf?job_ids=${jobIds.join(',')}`
                                : `/api/v1/stig/reports/download/${configAnalysisResults.jobId}?format=pdf`;

                              const response = await api.get(endpoint, { responseType: 'blob' });
                              if (response.data.type === 'application/json') {
                                const text = await response.data.text();
                                const errorData = JSON.parse(text);
                                throw new Error(errorData.error?.message || 'Download failed');
                              }
                              const url = window.URL.createObjectURL(new Blob([response.data]));
                              const link = document.createElement('a');
                              link.href = url;
                              const filename = jobIds.length > 1
                                ? `Combined_STIG_Report.pdf`
                                : `STIG_Report_${configAnalysisResults.jobId}.pdf`;
                              link.setAttribute('download', filename);
                              document.body.appendChild(link);
                              link.click();
                              link.remove();
                              window.URL.revokeObjectURL(url);
                            } catch (error: unknown) {
                              let message = 'Download failed';
                              if (error && typeof error === 'object' && 'response' in error) {
                                const axiosError = error as { response?: { status?: number; data?: Blob } };
                                if (axiosError.response?.data instanceof Blob) {
                                  try {
                                    const text = await axiosError.response.data.text();
                                    const errorData = JSON.parse(text);
                                    message = errorData.error?.message || errorData.detail || `Request failed with status code ${axiosError.response?.status}`;
                                  } catch {
                                    message = `Request failed with status code ${axiosError.response?.status}`;
                                  }
                                }
                              } else if (error instanceof Error) {
                                message = error.message;
                              }
                              alert(`Failed to download PDF: ${message}`);
                            }
                          }}
                          className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                        >
                          <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Download PDF
                        </Button>
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              // Use combined CKL (ZIP) endpoint if multiple jobs
                              const jobIds = configAnalysisResults.jobIds || [configAnalysisResults.jobId];
                              const endpoint = jobIds.length > 1
                                ? `/api/v1/stig/reports/combined-ckl?job_ids=${jobIds.join(',')}`
                                : `/api/v1/stig/reports/download/${configAnalysisResults.jobId}?format=ckl`;

                              const response = await api.get(endpoint, { responseType: 'blob' });
                              if (response.data.type === 'application/json') {
                                const text = await response.data.text();
                                const errorData = JSON.parse(text);
                                throw new Error(errorData.error?.message || 'Download failed');
                              }
                              const url = window.URL.createObjectURL(new Blob([response.data]));
                              const link = document.createElement('a');
                              link.href = url;
                              const filename = jobIds.length > 1
                                ? `STIG_Checklists.zip`
                                : `STIG_Report_${configAnalysisResults.jobId}.ckl`;
                              link.setAttribute('download', filename);
                              document.body.appendChild(link);
                              link.click();
                              link.remove();
                              window.URL.revokeObjectURL(url);
                            } catch (error: unknown) {
                              let message = 'Download failed';
                              if (error && typeof error === 'object' && 'response' in error) {
                                const axiosError = error as { response?: { status?: number; data?: Blob } };
                                if (axiosError.response?.data instanceof Blob) {
                                  try {
                                    const text = await axiosError.response.data.text();
                                    const errorData = JSON.parse(text);
                                    message = errorData.error?.message || errorData.detail || `Request failed with status code ${axiosError.response?.status}`;
                                  } catch {
                                    message = `Request failed with status code ${axiosError.response?.status}`;
                                  }
                                }
                              } else if (error instanceof Error) {
                                message = error.message;
                              }
                              alert(`Failed to download CKL: ${message}`);
                            }
                          }}
                          className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
                        >
                          <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Download CKL
                        </Button>
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
                    disabled={
                      (!selectedBenchmarkId && targetDefinitions.filter((td) => td.enabled).length === 0) ||
                      !configFile ||
                      isAnalyzing
                    }
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
