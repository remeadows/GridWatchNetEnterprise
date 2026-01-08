import { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Input,
  Select,
  StatusIndicator,
} from "@netnynja/shared-ui";
import { useNPMStore, type DiscoveryJob } from "../../../stores/npm";
import { useSNMPv3CredentialsStore } from "../../../stores/snmpv3-credentials";

const statusMap: Record<string, "success" | "error" | "warning" | "neutral"> = {
  pending: "neutral",
  running: "warning",
  completed: "success",
  failed: "error",
  cancelled: "neutral",
};

const methodLabels: Record<string, string> = {
  icmp: "ICMP Ping Only",
  snmpv3: "SNMPv3 Only",
  both: "ICMP + SNMPv3",
};

export function NPMDiscoveryPage() {
  const {
    discoveryJobs,
    selectedJob,
    discoveredHosts,
    jobSites,
    isLoading,
    fetchDiscoveryJobs,
    fetchDiscoveryJob,
    startDiscovery,
    cancelDiscoveryJob,
    deleteDiscoveryJob,
    fetchDiscoveredHosts,
    addHostsToMonitoring,
    fetchJobSites,
    updateHostsSite,
    fetchDevices,
  } = useNPMStore();
  const { credentials, fetchCredentials } = useSNMPv3CredentialsStore();

  const [showNewDiscoveryModal, setShowNewDiscoveryModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [showAssignSiteModal, setShowAssignSiteModal] = useState(false);
  const [selectedHosts, setSelectedHosts] = useState<Set<string>>(new Set());
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [newSiteName, setNewSiteName] = useState("");
  const [newDiscovery, setNewDiscovery] = useState({
    name: "",
    cidr: "",
    discoveryMethod: "both" as "icmp" | "snmpv3" | "both",
    snmpv3CredentialId: "",
    site: "",
  });
  const [addConfig, setAddConfig] = useState({
    pollIcmp: true,
    pollSnmp: false,
    pollInterval: "60",
  });

  useEffect(() => {
    fetchDiscoveryJobs();
    fetchCredentials();
  }, [fetchDiscoveryJobs, fetchCredentials]);

  // Auto-refresh running jobs
  useEffect(() => {
    const hasRunningJobs = discoveryJobs.some((j) => j.status === "running");
    if (hasRunningJobs) {
      const interval = setInterval(() => {
        fetchDiscoveryJobs();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [discoveryJobs, fetchDiscoveryJobs]);

  const handleStartDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await startDiscovery({
        name: newDiscovery.name,
        cidr: newDiscovery.cidr,
        discoveryMethod: newDiscovery.discoveryMethod,
        snmpv3CredentialId:
          newDiscovery.discoveryMethod !== "icmp" &&
          newDiscovery.snmpv3CredentialId
            ? newDiscovery.snmpv3CredentialId
            : undefined,
        site: newDiscovery.site || undefined,
      });
      setShowNewDiscoveryModal(false);
      setNewDiscovery({
        name: "",
        cidr: "",
        discoveryMethod: "both",
        snmpv3CredentialId: "",
        site: "",
      });
    } catch {
      // Error handled in store
    }
  };

  const handleViewResults = async (job: DiscoveryJob) => {
    await fetchDiscoveryJob(job.id);
    await fetchDiscoveredHosts(job.id);
    await fetchJobSites(job.id);
    setSelectedHosts(new Set());
    setSiteFilter("all");
    setShowResultsModal(true);
  };

  const handleAssignSite = async () => {
    if (selectedHosts.size === 0 || !selectedJob) return;
    try {
      await updateHostsSite(
        selectedJob.id,
        Array.from(selectedHosts),
        newSiteName || null,
      );
      await fetchJobSites(selectedJob.id);
      setShowAssignSiteModal(false);
      setSelectedHosts(new Set());
      setNewSiteName("");
    } catch {
      // Error handled in store
    }
  };

  // Filter hosts by site
  const filteredHosts =
    siteFilter === "all"
      ? discoveredHosts
      : siteFilter === "unassigned"
        ? discoveredHosts.filter((h) => !h.site)
        : discoveredHosts.filter((h) => h.site === siteFilter);

  const handleAddSelected = async () => {
    if (selectedHosts.size === 0 || !selectedJob) return;
    try {
      await addHostsToMonitoring(selectedJob.id, {
        hostIds: Array.from(selectedHosts),
        pollIcmp: addConfig.pollIcmp,
        pollSnmp: addConfig.pollSnmp,
        snmpv3CredentialId: selectedJob.snmpv3CredentialId,
        pollInterval: parseInt(addConfig.pollInterval),
      });
      setSelectedHosts(new Set());
      await fetchDevices();
    } catch {
      // Error handled in store
    }
  };

  const toggleHost = (hostId: string) => {
    const newSelected = new Set(selectedHosts);
    if (newSelected.has(hostId)) {
      newSelected.delete(hostId);
    } else {
      newSelected.add(hostId);
    }
    setSelectedHosts(newSelected);
  };

  const selectAllReachable = () => {
    const reachableHosts = discoveredHosts.filter(
      (h) => (h.icmpReachable || h.snmpReachable) && !h.isAddedToMonitoring,
    );
    setSelectedHosts(new Set(reachableHosts.map((h) => h.id)));
  };

  const credentialOptions = [
    { value: "", label: "Select a credential..." },
    ...credentials.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Network Discovery
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Scan networks to discover devices for monitoring
          </p>
        </div>
        <Button onClick={() => setShowNewDiscoveryModal(true)}>
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
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          New Discovery
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {discoveryJobs.length}
          </p>
          <p className="text-sm text-gray-500">Total Scans</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-amber-600">
            {discoveryJobs.filter((j) => j.status === "running").length}
          </p>
          <p className="text-sm text-gray-500">Running</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-green-600">
            {discoveryJobs.filter((j) => j.status === "completed").length}
          </p>
          <p className="text-sm text-gray-500">Completed</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {discoveryJobs.reduce((acc, j) => acc + j.discoveredHosts, 0)}
          </p>
          <p className="text-sm text-gray-500">Devices Found</p>
        </Card>
      </div>

      {/* Discovery Jobs List */}
      <Card>
        <CardHeader>
          <CardTitle>Discovery Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && discoveryJobs.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              Loading discovery jobs...
            </div>
          ) : discoveryJobs.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              No discovery jobs yet. Start a new discovery to find devices on
              your network.
            </div>
          ) : (
            <div className="space-y-4">
              {discoveryJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                >
                  <div className="flex items-center gap-4">
                    <StatusIndicator
                      status={statusMap[job.status]}
                      label={job.status.toUpperCase()}
                      pulse={job.status === "running"}
                    />
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-white">
                        {job.name}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
                          {job.cidr}
                        </code>
                        <Badge variant="secondary" className="text-xs">
                          {methodLabels[job.discoveryMethod]}
                        </Badge>
                        {job.site && (
                          <Badge
                            variant="default"
                            className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          >
                            {job.site}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    {job.status === "running" && (
                      <div className="w-32">
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>Progress</span>
                          <span>{job.progressPercent}%</span>
                        </div>
                        <div className="mt-1 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                          <div
                            className="h-2 rounded-full bg-blue-500"
                            style={{ width: `${job.progressPercent}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {job.discoveredHosts} / {job.totalHosts}
                      </p>
                      <p className="text-xs text-gray-500">devices found</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-900 dark:text-white">
                        {new Date(job.createdAt).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(job.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {job.status === "completed" &&
                        job.discoveredHosts > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewResults(job)}
                          >
                            View Results
                          </Button>
                        )}
                      {job.status === "running" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelDiscoveryJob(job.id)}
                        >
                          Cancel
                        </Button>
                      )}
                      {["completed", "failed", "cancelled"].includes(
                        job.status,
                      ) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          onClick={() => deleteDiscoveryJob(job.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Discovery Modal */}
      {showNewDiscoveryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Start Network Discovery
              </h2>
              <form onSubmit={handleStartDiscovery} className="space-y-4">
                <Input
                  label="Name"
                  value={newDiscovery.name}
                  onChange={(e) =>
                    setNewDiscovery({ ...newDiscovery, name: e.target.value })
                  }
                  placeholder="e.g., Office Network Scan"
                  required
                />
                <Input
                  label="Network (CIDR)"
                  value={newDiscovery.cidr}
                  onChange={(e) =>
                    setNewDiscovery({ ...newDiscovery, cidr: e.target.value })
                  }
                  placeholder="e.g., 192.168.1.0/24"
                  required
                />
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Discovery Method
                  </label>
                  <select
                    value={newDiscovery.discoveryMethod}
                    onChange={(e) =>
                      setNewDiscovery({
                        ...newDiscovery,
                        discoveryMethod: e.target.value as
                          | "icmp"
                          | "snmpv3"
                          | "both",
                      })
                    }
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="icmp">ICMP Ping Only (Fast)</option>
                    <option value="snmpv3">SNMPv3 Only (Detailed)</option>
                    <option value="both">ICMP + SNMPv3 (Recommended)</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {newDiscovery.discoveryMethod === "icmp" &&
                      "Only checks if hosts respond to ping. Fast but limited info."}
                    {newDiscovery.discoveryMethod === "snmpv3" &&
                      "Queries SNMP for device details. Requires credential."}
                    {newDiscovery.discoveryMethod === "both" &&
                      "Combines ping check with SNMP details for reachable hosts."}
                  </p>
                </div>
                {newDiscovery.discoveryMethod !== "icmp" && (
                  <div>
                    <Select
                      label="SNMPv3 Credential"
                      value={newDiscovery.snmpv3CredentialId}
                      onChange={(e) =>
                        setNewDiscovery({
                          ...newDiscovery,
                          snmpv3CredentialId: e.target.value,
                        })
                      }
                      options={credentialOptions}
                    />
                    {!newDiscovery.snmpv3CredentialId && (
                      <p className="mt-1 text-xs text-amber-600">
                        An SNMPv3 credential is required.{" "}
                        <a href="/npm/credentials" className="underline">
                          Create one
                        </a>{" "}
                        if you haven't yet.
                      </p>
                    )}
                  </div>
                )}
                <Input
                  label="Site (Optional)"
                  value={newDiscovery.site}
                  onChange={(e) =>
                    setNewDiscovery({ ...newDiscovery, site: e.target.value })
                  }
                  placeholder="e.g., HQ, Building A, Data Center"
                />
                <p className="text-xs text-gray-500">
                  All discovered hosts will be assigned to this site. You can
                  change site assignments later.
                </p>
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowNewDiscoveryModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    loading={isLoading}
                    disabled={
                      !newDiscovery.name ||
                      !newDiscovery.cidr ||
                      (newDiscovery.discoveryMethod !== "icmp" &&
                        !newDiscovery.snmpv3CredentialId)
                    }
                  >
                    Start Discovery
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Results Modal */}
      {showResultsModal && selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <CardContent className="pt-6 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Discovery Results: {selectedJob.name}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {selectedJob.cidr} - {discoveredHosts.length} hosts found
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowResultsModal(false)}
                >
                  Close
                </Button>
              </div>

              {/* Site Filter */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Filter by Site:
                </span>
                <button
                  onClick={() => setSiteFilter("all")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    siteFilter === "all"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  All ({discoveredHosts.length})
                </button>
                <button
                  onClick={() => setSiteFilter("unassigned")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    siteFilter === "unassigned"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  Unassigned ({discoveredHosts.filter((h) => !h.site).length})
                </button>
                {jobSites
                  .filter((s) => s.site !== null)
                  .map((siteInfo) => (
                    <button
                      key={siteInfo.site!}
                      onClick={() => setSiteFilter(siteInfo.site!)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        siteFilter === siteInfo.site
                          ? "bg-green-600 text-white"
                          : "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200"
                      }`}
                    >
                      {siteInfo.site} ({siteInfo.count})
                    </button>
                  ))}
              </div>

              {/* Add to Monitoring Controls */}
              {discoveredHosts.some((h) => !h.isAddedToMonitoring) && (
                <div className="mb-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {selectedHosts.size} selected
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={selectAllReachable}
                      >
                        Select All Reachable
                      </Button>
                      {selectedHosts.size > 0 && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedHosts(new Set())}
                          >
                            Clear Selection
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAssignSiteModal(true)}
                          >
                            Assign Site
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-end gap-4">
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={addConfig.pollIcmp}
                          onChange={(e) =>
                            setAddConfig({
                              ...addConfig,
                              pollIcmp: e.target.checked,
                            })
                          }
                          className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          ICMP
                        </span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={addConfig.pollSnmp}
                          onChange={(e) =>
                            setAddConfig({
                              ...addConfig,
                              pollSnmp: e.target.checked,
                            })
                          }
                          className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          SNMPv3
                        </span>
                      </label>
                    </div>
                    <Input
                      label="Poll Interval"
                      type="number"
                      value={addConfig.pollInterval}
                      onChange={(e) =>
                        setAddConfig({
                          ...addConfig,
                          pollInterval: e.target.value,
                        })
                      }
                      className="w-24"
                    />
                    <Button
                      onClick={handleAddSelected}
                      disabled={
                        selectedHosts.size === 0 ||
                        (!addConfig.pollIcmp && !addConfig.pollSnmp)
                      }
                    >
                      Add to Monitoring ({selectedHosts.size})
                    </Button>
                  </div>
                </div>
              )}

              {/* Hosts Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-2 py-2 text-left">
                        <input
                          type="checkbox"
                          checked={
                            selectedHosts.size ===
                            discoveredHosts.filter(
                              (h) => !h.isAddedToMonitoring,
                            ).length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedHosts(
                                new Set(
                                  discoveredHosts
                                    .filter((h) => !h.isAddedToMonitoring)
                                    .map((h) => h.id),
                                ),
                              );
                            } else {
                              setSelectedHosts(new Set());
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        />
                      </th>
                      <th className="px-2 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                        IP Address
                      </th>
                      <th className="px-2 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                        Name
                      </th>
                      <th className="px-2 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                        Type
                      </th>
                      <th className="px-2 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                        Vendor
                      </th>
                      <th className="px-2 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                        OS Family
                      </th>
                      <th className="px-2 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                        Site
                      </th>
                      <th className="px-2 py-2 text-center font-medium text-gray-700 dark:text-gray-300">
                        ICMP
                      </th>
                      <th className="px-2 py-2 text-center font-medium text-gray-700 dark:text-gray-300">
                        SNMP
                      </th>
                      <th className="px-2 py-2 text-center font-medium text-gray-700 dark:text-gray-300">
                        Confidence
                      </th>
                      <th className="px-2 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHosts.map((host) => (
                      <tr
                        key={host.id}
                        className={`border-b border-gray-100 dark:border-gray-800 ${
                          selectedHosts.has(host.id)
                            ? "bg-blue-50 dark:bg-blue-900/20"
                            : ""
                        }`}
                      >
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={selectedHosts.has(host.id)}
                            onChange={() => toggleHost(host.id)}
                            disabled={host.isAddedToMonitoring}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 disabled:opacity-50"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">
                            {host.ipAddress}
                          </code>
                        </td>
                        <td className="px-2 py-2 text-gray-900 dark:text-white">
                          {host.sysName || host.hostname || "-"}
                        </td>
                        <td className="px-2 py-2 text-gray-500">
                          {host.deviceType || "-"}
                        </td>
                        <td className="px-2 py-2 text-gray-500">
                          {host.vendor || "-"}
                        </td>
                        <td className="px-2 py-2 text-gray-500">
                          {host.osFamily || "-"}
                          {host.icmpTtl && (
                            <span
                              className="text-xs text-gray-400 ml-1"
                              title={`TTL: ${host.icmpTtl}`}
                            >
                              (TTL:{host.icmpTtl})
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {host.site ? (
                            <Badge
                              variant="default"
                              className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            >
                              {host.site}
                            </Badge>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {host.icmpReachable ? (
                            <Badge variant="success" className="text-xs">
                              {host.icmpLatencyMs?.toFixed(1)}ms
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              -
                            </Badge>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {host.snmpReachable ? (
                            <Badge variant="success" className="text-xs">
                              OK
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              -
                            </Badge>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {host.fingerprintConfidence === "high" ? (
                            <Badge variant="success" className="text-xs">
                              High
                            </Badge>
                          ) : host.fingerprintConfidence === "medium" ? (
                            <Badge variant="warning" className="text-xs">
                              Medium
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              Low
                            </Badge>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {host.isAddedToMonitoring ? (
                            <Badge variant="default" className="text-xs">
                              Added
                            </Badge>
                          ) : host.icmpReachable || host.snmpReachable ? (
                            <Badge variant="success" className="text-xs">
                              Reachable
                            </Badge>
                          ) : (
                            <Badge variant="error" className="text-xs">
                              Unreachable
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Assign Site Modal */}
      {showAssignSiteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Assign Site</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                Assign {selectedHosts.size} selected host(s) to a site.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Select Existing Site or Create New
                  </label>
                  <select
                    value={newSiteName}
                    onChange={(e) => setNewSiteName(e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 mb-2"
                  >
                    <option value="">-- Remove Site Assignment --</option>
                    {jobSites
                      .filter((s) => s.site !== null)
                      .map((siteInfo) => (
                        <option key={siteInfo.site!} value={siteInfo.site!}>
                          {siteInfo.site} ({siteInfo.count} hosts)
                        </option>
                      ))}
                  </select>
                  <Input
                    label="Or Enter New Site Name"
                    value={newSiteName}
                    onChange={(e) => setNewSiteName(e.target.value)}
                    placeholder="e.g., HQ, Building A, Data Center"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAssignSiteModal(false);
                      setNewSiteName("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleAssignSite} loading={isLoading}>
                    {newSiteName ? `Assign to "${newSiteName}"` : "Remove Site"}
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
