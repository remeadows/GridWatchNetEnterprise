import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  DataTable,
  StatsCard,
  StatusIndicator,
} from "@netnynja/shared-ui";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import type { IPAddress } from "@netnynja/shared-types";
import { useIPAMStore } from "../../../stores/ipam";
import { useSNMPv3CredentialsStore } from "../../../stores/snmpv3-credentials";

// Scan type options
const SCAN_TYPES = [
  { value: "ping", label: "ICMP Ping", description: "Fast ping sweep" },
  {
    value: "tcp",
    label: "TCP Scan",
    description: "TCP port scan (common ports)",
  },
  { value: "nmap", label: "NMAP Full", description: "Comprehensive NMAP scan" },
] as const;

const getColumns = (enableSelection: boolean): ColumnDef<IPAddress>[] => {
  const cols: ColumnDef<IPAddress>[] = [];

  if (enableSelection) {
    cols.push({
      id: "select",
      header: ({ table }) => (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300"
          checked={table.getIsAllPageRowsSelected()}
          onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300"
          checked={row.getIsSelected()}
          onChange={(e) => row.toggleSelected(e.target.checked)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    });
  }

  cols.push(
    {
      accessorKey: "address",
      header: "IP Address",
      cell: ({ row }) => (
        <code className="rounded bg-gray-100 px-2 py-1 text-sm dark:bg-gray-800">
          {row.original.address}
        </code>
      ),
    },
    {
      accessorKey: "hostname",
      header: "Hostname",
      cell: ({ row }) => row.original.hostname || "-",
    },
    {
      accessorKey: "macAddress",
      header: "MAC Address",
      cell: ({ row }) =>
        row.original.macAddress ? (
          <code className="text-sm">{row.original.macAddress}</code>
        ) : (
          "-"
        ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const statusMap = {
          active: "success",
          inactive: "neutral",
          reserved: "info",
          dhcp: "warning",
          unknown: "neutral",
        } as const;
        return (
          <StatusIndicator
            status={statusMap[row.original.status]}
            label={
              row.original.status.charAt(0).toUpperCase() +
              row.original.status.slice(1)
            }
          />
        );
      },
    },
    {
      accessorKey: "lastSeen",
      header: "Last Seen",
      cell: ({ row }) =>
        row.original.lastSeen
          ? new Date(row.original.lastSeen).toLocaleDateString()
          : "-",
    },
  );

  return cols;
};

export function IPAMNetworkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    selectedNetwork,
    addresses,
    scanJobs,
    currentScan,
    isLoading,
    isAddingToNpm,
    fetchNetwork,
    fetchAddresses,
    fetchScanHistory,
    fetchScanStatus,
    startScan,
    deleteScan,
    updateScan,
    exportScan,
    exportNetwork,
    deleteNetwork,
    addAddressesToNpm,
  } = useIPAMStore();

  const { credentials, fetchCredentials } = useSNMPv3CredentialsStore();

  const [showScanModal, setShowScanModal] = useState(false);
  const [selectedScanType, setSelectedScanType] = useState<string>("ping");
  const [isScanning, setIsScanning] = useState(false);

  // Edit scan state
  const [showEditScanModal, setShowEditScanModal] = useState(false);
  const [editingScan, setEditingScan] = useState<{
    id: string;
    name: string;
    notes: string;
  } | null>(null);

  // NPM integration state
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [showAddToNpmModal, setShowAddToNpmModal] = useState(false);
  const [npmPollIcmp, setNpmPollIcmp] = useState(true);
  const [npmPollSnmp, setNpmPollSnmp] = useState(false);
  const [npmSnmpCredentialId, setNpmSnmpCredentialId] = useState<string>("");
  const [npmPollInterval, setNpmPollInterval] = useState(60);
  const [addToNpmResult, setAddToNpmResult] = useState<{
    addedCount: number;
    skippedCount: number;
  } | null>(null);

  useEffect(() => {
    if (id) {
      fetchNetwork(id);
      fetchAddresses(id);
      fetchScanHistory(id);
    }
  }, [id, fetchNetwork, fetchAddresses, fetchScanHistory]);

  // Fetch SNMP credentials when modal is opened
  useEffect(() => {
    if (showAddToNpmModal && credentials.length === 0) {
      fetchCredentials();
    }
  }, [showAddToNpmModal, credentials.length, fetchCredentials]);

  // Poll for scan status when there's an active scan
  useEffect(() => {
    if (
      !currentScan ||
      currentScan.status === "completed" ||
      currentScan.status === "failed"
    ) {
      setIsScanning(false);
      return;
    }

    setIsScanning(true);
    const interval = setInterval(() => {
      fetchScanStatus(currentScan.id);
    }, 2000);

    return () => clearInterval(interval);
  }, [currentScan, fetchScanStatus]);

  // Refresh addresses when scan completes
  useEffect(() => {
    if (currentScan?.status === "completed" && id) {
      fetchAddresses(id);
    }
  }, [currentScan?.status, id, fetchAddresses]);

  const handleStartScan = useCallback(async () => {
    if (id) {
      setShowScanModal(false);
      await startScan(id, selectedScanType);
    }
  }, [id, selectedScanType, startScan]);

  const handleDelete = async () => {
    if (id && window.confirm("Are you sure you want to delete this network?")) {
      await deleteNetwork(id);
      navigate("/ipam/networks");
    }
  };

  // Get selected address IDs
  const selectedAddressIds = Object.keys(rowSelection)
    .filter((key) => rowSelection[key])
    .map((index) => addresses[parseInt(index, 10)]?.id)
    .filter((id): id is string => !!id);

  const handleAddToNpm = useCallback(async () => {
    if (selectedAddressIds.length === 0) return;

    // Validate SNMP credential if SNMP polling is enabled
    if (npmPollSnmp && !npmSnmpCredentialId) {
      alert("Please select an SNMPv3 credential when SNMP polling is enabled");
      return;
    }

    try {
      const result = await addAddressesToNpm({
        addressIds: selectedAddressIds,
        pollIcmp: npmPollIcmp,
        pollSnmp: npmPollSnmp,
        snmpv3CredentialId: npmPollSnmp ? npmSnmpCredentialId : undefined,
        pollInterval: npmPollInterval,
      });

      setAddToNpmResult({
        addedCount: result.addedCount,
        skippedCount: result.skippedCount,
      });

      // Clear selection after successful add
      setRowSelection({});
    } catch {
      // Error is handled by the store
    }
  }, [
    selectedAddressIds,
    npmPollIcmp,
    npmPollSnmp,
    npmSnmpCredentialId,
    npmPollInterval,
    addAddressesToNpm,
  ]);

  const handleCloseAddToNpmModal = useCallback(() => {
    setShowAddToNpmModal(false);
    setAddToNpmResult(null);
    setNpmPollIcmp(true);
    setNpmPollSnmp(false);
    setNpmSnmpCredentialId("");
    setNpmPollInterval(60);
  }, []);

  const handleEditScan = useCallback(
    (scan: { id: string; name?: string; notes?: string }) => {
      setEditingScan({
        id: scan.id,
        name: scan.name || "",
        notes: scan.notes || "",
      });
      setShowEditScanModal(true);
    },
    [],
  );

  const handleSaveScanEdit = useCallback(async () => {
    if (!editingScan) return;
    try {
      await updateScan(editingScan.id, {
        name: editingScan.name || undefined,
        notes: editingScan.notes || undefined,
      });
      setShowEditScanModal(false);
      setEditingScan(null);
    } catch {
      // Error handled by store
    }
  }, [editingScan, updateScan]);

  if (!selectedNetwork && !isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Network not found</p>
      </div>
    );
  }

  const activeIPs = addresses.filter((a) => a.status === "active").length;
  const totalCapacity = 254; // Assuming /24 for simplicity

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/ipam/networks")}>
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {selectedNetwork?.name || "Loading..."}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {selectedNetwork?.network}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setShowScanModal(true)}
            disabled={isScanning}
          >
            {isScanning ? (
              <>
                <svg
                  className="mr-2 h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Scanning...
              </>
            ) : (
              <>
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
                Scan Network
              </>
            )}
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Addresses"
          value={addresses.length}
          subtitle={`of ${totalCapacity} available`}
        />
        <StatsCard
          title="Active Devices"
          value={activeIPs}
          icon={
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatsCard
          title="Utilization"
          value={`${Math.round((activeIPs / totalCapacity) * 100)}%`}
        />
        <StatsCard title="VLAN" value={selectedNetwork?.vlanId || "N/A"} />
      </div>

      {/* Network Details */}
      <Card>
        <CardHeader>
          <CardTitle>Network Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Gateway
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                {selectedNetwork?.gateway || "Not configured"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Site
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                {selectedNetwork?.site || "Not specified"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Location
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                {selectedNetwork?.location || "Not specified"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Status
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                {selectedNetwork?.isActive ? "Active" : "Inactive"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                DNS Servers
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                {selectedNetwork?.dnsServers?.join(", ") || "Not configured"}
              </dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Description
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                {selectedNetwork?.description || "No description"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Current Scan Status */}
      {currentScan &&
        (currentScan.status === "pending" ||
          currentScan.status === "running") && (
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <svg
                  className="h-6 w-6 animate-spin text-blue-500"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    Scan in Progress:{" "}
                    {currentScan.scanType?.toUpperCase() || "PING"}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Status: {currentScan.status}
                    {currentScan.totalIps !== undefined &&
                      ` | Total IPs: ${currentScan.totalIps}`}
                    {currentScan.activeIps !== undefined &&
                      ` | Active: ${currentScan.activeIps}`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

      {/* IP Addresses */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>IP Addresses</CardTitle>
          {selectedAddressIds.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setShowAddToNpmModal(true)}
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
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              Add {selectedAddressIds.length} to NPM
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <DataTable
            columns={getColumns(true)}
            data={addresses}
            loading={isLoading}
            searchable
            searchPlaceholder="Search IP addresses..."
            emptyMessage="No IP addresses discovered yet. Run a network scan to discover devices."
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
          />
        </CardContent>
      </Card>

      {/* Scan History */}
      {scanJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Scan History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {scanJobs.slice(0, 10).map((scan) => (
                <div
                  key={scan.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                >
                  <div className="flex items-center gap-3">
                    <StatusIndicator
                      status={
                        scan.status === "completed"
                          ? "success"
                          : scan.status === "failed"
                            ? "error"
                            : scan.status === "running" ||
                                scan.status === "pending"
                              ? "warning"
                              : "neutral"
                      }
                      label={
                        scan.status.charAt(0).toUpperCase() +
                        scan.status.slice(1)
                      }
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {scan.name ||
                          `${scan.scanType?.toUpperCase() || "PING"} Scan`}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {scan.scanType?.toUpperCase() || "PING"} -{" "}
                        {scan.startedAt
                          ? new Date(scan.startedAt).toLocaleString()
                          : "N/A"}
                      </p>
                      {scan.notes && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic">
                          {scan.notes.length > 50
                            ? `${scan.notes.slice(0, 50)}...`
                            : scan.notes}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-sm">
                      {scan.status === "completed" && (
                        <>
                          <p className="text-gray-900 dark:text-white">
                            {scan.activeIps ?? 0} active / {scan.totalIps ?? 0}{" "}
                            total
                          </p>
                          {(scan.newIps ?? 0) > 0 && (
                            <p className="text-xs text-green-600 dark:text-green-400">
                              +{scan.newIps} new
                            </p>
                          )}
                        </>
                      )}
                      {scan.status === "failed" && scan.errorMessage && (
                        <p className="text-xs text-red-600 dark:text-red-400">
                          {scan.errorMessage}
                        </p>
                      )}
                    </div>
                    {scan.status !== "running" && scan.status !== "pending" && (
                      <>
                        <button
                          onClick={() => exportScan(scan.id, "pdf")}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-green-600 dark:hover:bg-gray-700"
                          title="Export to PDF"
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
                              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => exportScan(scan.id, "csv")}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-green-600 dark:hover:bg-gray-700"
                          title="Export to CSV"
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
                              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleEditScan(scan)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-600 dark:hover:bg-gray-700"
                          title="Edit scan"
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
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                "Are you sure you want to delete this scan?",
                              )
                            ) {
                              deleteScan(scan.id);
                            }
                          }}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-700"
                          title="Delete scan"
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
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scan Type Selection Modal */}
      {showScanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Start Network Scan
            </h3>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Select the type of scan to perform on {selectedNetwork?.name}
            </p>
            <div className="space-y-2">
              {SCAN_TYPES.map((type) => (
                <label
                  key={type.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                    selectedScanType === type.value
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="scanType"
                    value={type.value}
                    checked={selectedScanType === type.value}
                    onChange={(e) => setSelectedScanType(e.target.value)}
                    className="h-4 w-4 text-blue-600"
                  />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {type.label}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {type.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowScanModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleStartScan}>Start Scan</Button>
            </div>
          </div>
        </div>
      )}

      {/* Add to NPM Modal */}
      {showAddToNpmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Add to NPM Monitoring
            </h3>

            {addToNpmResult ? (
              // Success view
              <div>
                <div className="mb-4 rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
                  <div className="flex items-center gap-2">
                    <svg
                      className="h-5 w-5 text-green-600 dark:text-green-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="font-medium text-green-800 dark:text-green-200">
                      Successfully added to NPM
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-green-700 dark:text-green-300">
                    {addToNpmResult.addedCount} device(s) added to monitoring
                    {addToNpmResult.skippedCount > 0 &&
                      `, ${addToNpmResult.skippedCount} skipped (already monitored)`}
                  </p>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleCloseAddToNpmModal}>Close</Button>
                </div>
              </div>
            ) : (
              // Form view
              <div>
                <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                  Configure monitoring options for {selectedAddressIds.length}{" "}
                  selected address(es)
                </p>

                <div className="space-y-4">
                  {/* Polling Methods */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Polling Methods
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={npmPollIcmp}
                          onChange={(e) => setNpmPollIcmp(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          ICMP Ping (recommended)
                        </span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={npmPollSnmp}
                          onChange={(e) => setNpmPollSnmp(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          SNMPv3 Polling
                        </span>
                      </label>
                    </div>
                    {!npmPollIcmp && !npmPollSnmp && (
                      <p className="mt-1 text-xs text-red-500">
                        At least one polling method must be enabled
                      </p>
                    )}
                  </div>

                  {/* SNMPv3 Credential Selection (shown when SNMP is enabled) */}
                  {npmPollSnmp && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        SNMPv3 Credential
                      </label>
                      <select
                        value={npmSnmpCredentialId}
                        onChange={(e) => setNpmSnmpCredentialId(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      >
                        <option value="">Select a credential...</option>
                        {credentials.map((cred) => (
                          <option key={cred.id} value={cred.id}>
                            {cred.name}
                          </option>
                        ))}
                      </select>
                      {npmPollSnmp && !npmSnmpCredentialId && (
                        <p className="mt-1 text-xs text-red-500">
                          SNMPv3 credential is required when SNMP polling is
                          enabled
                        </p>
                      )}
                    </div>
                  )}

                  {/* Poll Interval */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Poll Interval (seconds)
                    </label>
                    <select
                      value={npmPollInterval}
                      onChange={(e) =>
                        setNpmPollInterval(parseInt(e.target.value, 10))
                      }
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    >
                      <option value={30}>30 seconds</option>
                      <option value={60}>1 minute</option>
                      <option value={300}>5 minutes</option>
                      <option value={600}>10 minutes</option>
                      <option value={900}>15 minutes</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <Button variant="outline" onClick={handleCloseAddToNpmModal}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddToNpm}
                    disabled={
                      isAddingToNpm ||
                      (!npmPollIcmp && !npmPollSnmp) ||
                      (npmPollSnmp && !npmSnmpCredentialId)
                    }
                  >
                    {isAddingToNpm ? (
                      <>
                        <svg
                          className="mr-2 h-4 w-4 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Adding...
                      </>
                    ) : (
                      "Add to NPM"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Scan Modal */}
      {showEditScanModal && editingScan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Edit Scan
            </h3>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Name
                </label>
                <input
                  type="text"
                  value={editingScan.name}
                  onChange={(e) =>
                    setEditingScan({ ...editingScan, name: e.target.value })
                  }
                  placeholder="Enter a name for this scan"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Notes
                </label>
                <textarea
                  value={editingScan.notes}
                  onChange={(e) =>
                    setEditingScan({ ...editingScan, notes: e.target.value })
                  }
                  placeholder="Add notes about this scan..."
                  rows={4}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowEditScanModal(false);
                  setEditingScan(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveScanEdit} disabled={isLoading}>
                {isLoading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
