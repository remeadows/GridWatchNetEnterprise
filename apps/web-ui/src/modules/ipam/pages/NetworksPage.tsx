import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  DataTable,
  Badge,
  Input,
} from "@netnynja/shared-ui";
import type { ColumnDef } from "@tanstack/react-table";
import type { Network, ScanJob } from "@netnynja/shared-types";
import { useIPAMStore } from "../../../stores/ipam";
import { api } from "../../../lib/api";

export function IPAMNetworksPage() {
  const navigate = useNavigate();
  const {
    networks,
    isLoading,
    fetchNetworks,
    createNetwork,
    deleteNetwork,
    startScan,
    deleteScan,
  } = useIPAMStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [networkScans, setNetworkScans] = useState<
    Record<string, { lastScan?: ScanJob; scanCount: number }>
  >({});
  const [showScansModal, setShowScansModal] = useState(false);
  const [selectedNetworkScans, setSelectedNetworkScans] = useState<{
    networkId: string;
    networkName: string;
    scans: ScanJob[];
  } | null>(null);
  const [newNetwork, setNewNetwork] = useState({
    name: "",
    network: "",
    vlanId: "",
    site: "",
    location: "",
    description: "",
    isActive: true,
  });

  // Fetch scan data for all networks
  const fetchNetworkScans = useCallback(async () => {
    const scanData: Record<string, { lastScan?: ScanJob; scanCount: number }> =
      {};
    for (const network of networks) {
      try {
        const response = await api.get<{
          success: boolean;
          data: ScanJob[];
        }>(`/api/v1/ipam/networks/${network.id}/scans`);
        if (response.data.success && response.data.data) {
          const scans = response.data.data;
          scanData[network.id] = {
            lastScan: scans[0],
            scanCount: scans.length,
          };
        }
      } catch {
        scanData[network.id] = { scanCount: 0 };
      }
    }
    setNetworkScans(scanData);
  }, [networks]);

  useEffect(() => {
    fetchNetworks();
  }, [fetchNetworks]);

  // Fetch scan data when networks change
  useEffect(() => {
    if (networks.length > 0) {
      fetchNetworkScans();
    }
  }, [networks, fetchNetworkScans]);

  const handleViewScans = useCallback(async (network: Network) => {
    try {
      const response = await api.get<{
        success: boolean;
        data: ScanJob[];
      }>(`/api/v1/ipam/networks/${network.id}/scans`);
      if (response.data.success) {
        setSelectedNetworkScans({
          networkId: network.id,
          networkName: network.name,
          scans: response.data.data,
        });
        setShowScansModal(true);
      }
    } catch {
      // Error handled
    }
  }, []);

  const handleDeleteScan = useCallback(
    async (scanId: string) => {
      if (window.confirm("Are you sure you want to delete this scan?")) {
        try {
          await deleteScan(scanId);
          // Refresh the scans list
          if (selectedNetworkScans) {
            const response = await api.get<{
              success: boolean;
              data: ScanJob[];
            }>(`/api/v1/ipam/networks/${selectedNetworkScans.networkId}/scans`);
            if (response.data.success) {
              setSelectedNetworkScans({
                ...selectedNetworkScans,
                scans: response.data.data,
              });
            }
          }
          // Also refresh the network scans summary
          fetchNetworkScans();
        } catch {
          // Error handled in store
        }
      }
    },
    [deleteScan, selectedNetworkScans, fetchNetworkScans],
  );

  const handleQuickScan = useCallback(
    async (networkId: string) => {
      try {
        await startScan(networkId, ["ping"]);
        // Refresh scans after starting
        setTimeout(fetchNetworkScans, 1000);
      } catch {
        // Error handled in store
      }
    },
    [startScan, fetchNetworkScans],
  );

  const handleDeleteNetwork = useCallback(
    async (networkId: string, networkName: string) => {
      if (
        window.confirm(
          `Are you sure you want to delete "${networkName}"? This will also delete all associated IP addresses and scan history.`,
        )
      ) {
        try {
          await deleteNetwork(networkId);
        } catch {
          // Error handled in store
        }
      }
    },
    [deleteNetwork],
  );

  // Columns with actions
  const columns: ColumnDef<Network>[] = useMemo(
    () => [
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
        accessorKey: "network",
        header: "Network",
        cell: ({ row }) => (
          <code className="rounded bg-gray-100 px-2 py-1 text-sm dark:bg-gray-800">
            {row.original.network}
          </code>
        ),
      },
      {
        accessorKey: "vlanId",
        header: "VLAN",
        cell: ({ row }) => row.original.vlanId || "-",
      },
      {
        accessorKey: "site",
        header: "Site",
        cell: ({ row }) => row.original.site || "-",
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "success" : "secondary"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "scans",
        header: "Scans",
        cell: ({ row }) => {
          const scanInfo = networkScans[row.original.id];
          if (!scanInfo || scanInfo.scanCount === 0) {
            return <span className="text-sm text-gray-400">No scans</span>;
          }
          return (
            <div className="flex items-center gap-2">
              <Badge variant="default">{scanInfo.scanCount}</Badge>
              {scanInfo.lastScan && (
                <span className="text-xs text-gray-500">
                  Last:{" "}
                  {new Date(scanInfo.lastScan.startedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleQuickScan(row.original.id);
              }}
              title="Quick Ping Scan"
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
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleViewScans(row.original);
              }}
              title="View/Delete Scans"
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
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteNetwork(row.original.id, row.original.name);
              }}
              title="Delete Network"
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
    ],
    [networkScans, handleQuickScan, handleViewScans, handleDeleteNetwork],
  );

  const handleAddNetwork = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createNetwork({
        name: newNetwork.name,
        network: newNetwork.network,
        vlanId: newNetwork.vlanId ? parseInt(newNetwork.vlanId) : undefined,
        site: newNetwork.site || undefined,
        location: newNetwork.location || undefined,
        description: newNetwork.description || undefined,
        isActive: newNetwork.isActive,
      });
      setShowAddModal(false);
      setNewNetwork({
        name: "",
        network: "",
        vlanId: "",
        site: "",
        location: "",
        description: "",
        isActive: true,
      });
    } catch {
      // Error handled in store
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Networks
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Manage your IP network ranges
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
          Add Network
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={networks}
            loading={isLoading}
            searchable
            searchPlaceholder="Search networks..."
            onRowClick={(network) => navigate(`/ipam/networks/${network.id}`)}
            emptyMessage="No networks found. Add your first network to get started."
          />
        </CardContent>
      </Card>

      {/* Add Network Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Add Network</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddNetwork} className="space-y-4">
                <Input
                  label="Name"
                  value={newNetwork.name}
                  onChange={(e) =>
                    setNewNetwork({ ...newNetwork, name: e.target.value })
                  }
                  placeholder="e.g., Production LAN"
                  required
                />
                <Input
                  label="Network (CIDR)"
                  value={newNetwork.network}
                  onChange={(e) =>
                    setNewNetwork({ ...newNetwork, network: e.target.value })
                  }
                  placeholder="e.g., 192.168.1.0/24"
                  required
                />
                <Input
                  label="VLAN ID"
                  type="number"
                  value={newNetwork.vlanId}
                  onChange={(e) =>
                    setNewNetwork({ ...newNetwork, vlanId: e.target.value })
                  }
                  placeholder="e.g., 100"
                />
                <Input
                  label="Site"
                  value={newNetwork.site}
                  onChange={(e) =>
                    setNewNetwork({ ...newNetwork, site: e.target.value })
                  }
                  placeholder="e.g., Headquarters"
                />
                <Input
                  label="Location"
                  value={newNetwork.location}
                  onChange={(e) =>
                    setNewNetwork({ ...newNetwork, location: e.target.value })
                  }
                  placeholder="e.g., Data Center 1"
                />
                <Input
                  label="Description"
                  value={newNetwork.description}
                  onChange={(e) =>
                    setNewNetwork({
                      ...newNetwork,
                      description: e.target.value,
                    })
                  }
                  placeholder="Optional description"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={newNetwork.isActive}
                    onChange={(e) =>
                      setNewNetwork({
                        ...newNetwork,
                        isActive: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label
                    htmlFor="isActive"
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Active
                  </label>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAddModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" loading={isLoading}>
                    Add Network
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Scans Modal */}
      {showScansModal && selectedNetworkScans && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <CardHeader>
              <CardTitle>
                Scans for {selectedNetworkScans.networkName}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-y-auto max-h-[60vh]">
              {selectedNetworkScans.scans.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No scans found for this network.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedNetworkScans.scans.map((scan) => (
                    <div
                      key={scan.id}
                      className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {scan.name || scan.scanType.toUpperCase()}
                          </span>
                          <Badge
                            variant={
                              scan.status === "completed"
                                ? "success"
                                : scan.status === "failed"
                                  ? "error"
                                  : scan.status === "running"
                                    ? "warning"
                                    : "secondary"
                            }
                          >
                            {scan.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {new Date(scan.startedAt).toLocaleString()}
                          {scan.activeIps !== undefined && (
                            <span className="ml-2">
                              · {scan.activeIps}/{scan.totalIps} active
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={() => handleDeleteScan(scan.id)}
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
                  ))}
                </div>
              )}
              <div className="flex justify-end pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowScansModal(false);
                    setSelectedNetworkScans(null);
                  }}
                >
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
