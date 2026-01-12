import { useState, useEffect } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  DataTable,
  Input,
  Select,
  Badge,
} from "@netnynja/shared-ui";
import type { ColumnDef } from "@tanstack/react-table";
import type { SNMPv3Credential } from "@netnynja/shared-types";
import {
  useSNMPv3CredentialsStore,
  type CreateSNMPv3CredentialInput,
  type UpdateSNMPv3CredentialInput,
  type TestCredentialResult,
} from "../../../stores/snmpv3-credentials";

const securityLevelOptions = [
  { value: "noAuthNoPriv", label: "No Auth, No Privacy" },
  { value: "authNoPriv", label: "Auth, No Privacy" },
  { value: "authPriv", label: "Auth + Privacy (Recommended)" },
];

const authProtocolOptions = [
  { value: "SHA", label: "SHA (SHA-1)" },
  { value: "SHA-224", label: "SHA-224" },
  { value: "SHA-256", label: "SHA-256 (Recommended)" },
  { value: "SHA-384", label: "SHA-384" },
  { value: "SHA-512", label: "SHA-512" },
];

const privProtocolOptions = [
  { value: "AES", label: "AES (128-bit)" },
  { value: "AES-192", label: "AES-192" },
  { value: "AES-256", label: "AES-256 (Recommended)" },
];

const securityLevelVariants: Record<string, "warning" | "default" | "success"> =
  {
    noAuthNoPriv: "warning",
    authNoPriv: "default",
    authPriv: "success",
  };

export function SNMPv3CredentialsPage() {
  const {
    credentials,
    pagination,
    isLoading,
    error,
    fetchCredentials,
    createCredential,
    updateCredential,
    deleteCredential,
    testCredential,
  } = useSNMPv3CredentialsStore();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [selectedCredential, setSelectedCredential] =
    useState<SNMPv3Credential | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [testResult, setTestResult] = useState<TestCredentialResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testIp, setTestIp] = useState("");
  const [testPort, setTestPort] = useState("161");

  const [newCredential, setNewCredential] =
    useState<CreateSNMPv3CredentialInput>({
      name: "",
      description: "",
      username: "",
      securityLevel: "authPriv",
      authProtocol: "SHA-256",
      authPassword: "",
      privProtocol: "AES-256",
      privPassword: "",
      contextName: "",
      contextEngineId: "",
    });

  const [editCredential, setEditCredential] =
    useState<UpdateSNMPv3CredentialInput>({});

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const handleSearch = () => {
    fetchCredentials({ search: searchQuery, page: 1 });
  };

  const handleCreateCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createCredential(newCredential);
      setIsCreateModalOpen(false);
      resetNewCredential();
    } catch {
      // Error is handled in store
    }
  };

  const handleEditCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCredential) return;
    try {
      await updateCredential(selectedCredential.id, editCredential);
      setIsEditModalOpen(false);
      setSelectedCredential(null);
    } catch {
      // Error is handled in store
    }
  };

  const handleDeleteCredential = async (credential: SNMPv3Credential) => {
    if (
      window.confirm(
        `Are you sure you want to delete credential "${credential.name}"?`,
      )
    ) {
      try {
        await deleteCredential(credential.id);
      } catch {
        // Error is handled in store
      }
    }
  };

  const handleTestCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCredential || !testIp) return;
    try {
      setTestResult(null);
      setTestError(null);
      const result = await testCredential(
        selectedCredential.id,
        testIp,
        parseInt(testPort),
      );
      setTestResult(result);
    } catch (err) {
      setTestError(
        err instanceof Error ? err.message : "Unknown error",
      );
    }
  };

  const openEditModal = (credential: SNMPv3Credential) => {
    setSelectedCredential(credential);
    setEditCredential({
      name: credential.name,
      description: credential.description,
      username: credential.username,
      securityLevel: credential.securityLevel,
      authProtocol: credential.authProtocol,
      privProtocol: credential.privProtocol,
      contextName: credential.contextName,
      contextEngineId: credential.contextEngineId,
    });
    setIsEditModalOpen(true);
  };

  const openTestModal = (credential: SNMPv3Credential) => {
    setSelectedCredential(credential);
    setTestIp("");
    setTestPort("161");
    setTestResult(null);
    setTestError(null);
    setIsTestModalOpen(true);
  };

  const resetNewCredential = () => {
    setNewCredential({
      name: "",
      description: "",
      username: "",
      securityLevel: "authPriv",
      authProtocol: "SHA-256",
      authPassword: "",
      privProtocol: "AES-256",
      privPassword: "",
      contextName: "",
      contextEngineId: "",
    });
  };

  const columns: ColumnDef<SNMPv3Credential>[] = [
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
      accessorKey: "username",
      header: "Username",
    },
    {
      accessorKey: "securityLevel",
      header: "Security Level",
      cell: ({ row }) => (
        <Badge
          variant={
            securityLevelVariants[row.original.securityLevel] || "default"
          }
        >
          {row.original.securityLevel}
        </Badge>
      ),
    },
    {
      accessorKey: "authProtocol",
      header: "Auth Protocol",
      cell: ({ row }) => row.original.authProtocol || "-",
    },
    {
      accessorKey: "privProtocol",
      header: "Privacy Protocol",
      cell: ({ row }) => row.original.privProtocol || "-",
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="max-w-xs truncate text-gray-500">
          {row.original.description || "-"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const credential = row.original;
        return (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openTestModal(credential);
              }}
            >
              Test
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openEditModal(credential);
              }}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteCredential(credential);
              }}
            >
              Delete
            </Button>
          </div>
        );
      },
    },
  ];

  const showAuthFields =
    newCredential.securityLevel === "authNoPriv" ||
    newCredential.securityLevel === "authPriv";
  const showPrivFields = newCredential.securityLevel === "authPriv";

  const editShowAuthFields =
    editCredential.securityLevel === "authNoPriv" ||
    editCredential.securityLevel === "authPriv" ||
    (!editCredential.securityLevel &&
      (selectedCredential?.securityLevel === "authNoPriv" ||
        selectedCredential?.securityLevel === "authPriv"));
  const editShowPrivFields =
    editCredential.securityLevel === "authPriv" ||
    (!editCredential.securityLevel &&
      selectedCredential?.securityLevel === "authPriv");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            SNMPv3 Credentials
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Manage FIPS-compliant SNMPv3 credentials for device monitoring
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
          Add Credential
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Credentials ({pagination?.total || credentials.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-2">
            <Input
              placeholder="Search by name or username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="max-w-sm"
            />
            <Button variant="outline" onClick={handleSearch}>
              Search
            </Button>
          </div>
          <DataTable
            columns={columns}
            data={credentials}
            loading={isLoading}
            emptyMessage="No SNMPv3 credentials found. Add your first credential to get started."
          />
        </CardContent>
      </Card>

      {/* Create Credential Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Add SNMPv3 Credential</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateCredential} className="space-y-4">
                <Input
                  label="Name"
                  placeholder="e.g., Production Switches"
                  value={newCredential.name}
                  onChange={(e) =>
                    setNewCredential({ ...newCredential, name: e.target.value })
                  }
                  required
                />
                <Input
                  label="Description"
                  placeholder="Optional description"
                  value={newCredential.description}
                  onChange={(e) =>
                    setNewCredential({
                      ...newCredential,
                      description: e.target.value,
                    })
                  }
                />
                <Input
                  label="Username (Security Name)"
                  placeholder="SNMPv3 username"
                  value={newCredential.username}
                  onChange={(e) =>
                    setNewCredential({
                      ...newCredential,
                      username: e.target.value,
                    })
                  }
                  required
                />
                <Select
                  label="Security Level"
                  options={securityLevelOptions}
                  value={newCredential.securityLevel}
                  onChange={(e) =>
                    setNewCredential({
                      ...newCredential,
                      securityLevel: e.target.value as
                        | "noAuthNoPriv"
                        | "authNoPriv"
                        | "authPriv",
                    })
                  }
                />

                {showAuthFields && (
                  <>
                    <Select
                      label="Authentication Protocol"
                      options={authProtocolOptions}
                      value={newCredential.authProtocol || "SHA-256"}
                      onChange={(e) =>
                        setNewCredential({
                          ...newCredential,
                          authProtocol: e.target.value as
                            | "SHA"
                            | "SHA-224"
                            | "SHA-256"
                            | "SHA-384"
                            | "SHA-512",
                        })
                      }
                    />
                    <Input
                      label="Authentication Password"
                      type="password"
                      placeholder="Min 8 characters"
                      value={newCredential.authPassword}
                      onChange={(e) =>
                        setNewCredential({
                          ...newCredential,
                          authPassword: e.target.value,
                        })
                      }
                      required
                    />
                  </>
                )}

                {showPrivFields && (
                  <>
                    <Select
                      label="Privacy Protocol"
                      options={privProtocolOptions}
                      value={newCredential.privProtocol || "AES-256"}
                      onChange={(e) =>
                        setNewCredential({
                          ...newCredential,
                          privProtocol: e.target.value as
                            | "AES"
                            | "AES-192"
                            | "AES-256",
                        })
                      }
                    />
                    <Input
                      label="Privacy Password"
                      type="password"
                      placeholder="Min 8 characters"
                      value={newCredential.privPassword}
                      onChange={(e) =>
                        setNewCredential({
                          ...newCredential,
                          privPassword: e.target.value,
                        })
                      }
                      required
                    />
                  </>
                )}

                <div className="border-t pt-4 mt-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Advanced Options
                  </p>
                  <div className="space-y-3">
                    <Input
                      label="Context Name"
                      placeholder="Optional context name"
                      value={newCredential.contextName}
                      onChange={(e) =>
                        setNewCredential({
                          ...newCredential,
                          contextName: e.target.value,
                        })
                      }
                    />
                    <Input
                      label="Context Engine ID"
                      placeholder="Optional context engine ID"
                      value={newCredential.contextEngineId}
                      onChange={(e) =>
                        setNewCredential({
                          ...newCredential,
                          contextEngineId: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsCreateModalOpen(false);
                      resetNewCredential();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!newCredential.name || !newCredential.username}
                    loading={isLoading}
                  >
                    Create Credential
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Credential Modal */}
      {isEditModalOpen && selectedCredential && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Edit Credential: {selectedCredential.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEditCredential} className="space-y-4">
                <Input
                  label="Name"
                  placeholder="Credential name"
                  value={editCredential.name || ""}
                  onChange={(e) =>
                    setEditCredential({
                      ...editCredential,
                      name: e.target.value,
                    })
                  }
                />
                <Input
                  label="Description"
                  placeholder="Optional description"
                  value={editCredential.description || ""}
                  onChange={(e) =>
                    setEditCredential({
                      ...editCredential,
                      description: e.target.value,
                    })
                  }
                />
                <Input
                  label="Username"
                  placeholder="SNMPv3 username"
                  value={editCredential.username || ""}
                  onChange={(e) =>
                    setEditCredential({
                      ...editCredential,
                      username: e.target.value,
                    })
                  }
                />
                <Select
                  label="Security Level"
                  options={securityLevelOptions}
                  value={
                    editCredential.securityLevel ||
                    selectedCredential.securityLevel
                  }
                  onChange={(e) =>
                    setEditCredential({
                      ...editCredential,
                      securityLevel: e.target.value as
                        | "noAuthNoPriv"
                        | "authNoPriv"
                        | "authPriv",
                    })
                  }
                />

                {editShowAuthFields && (
                  <>
                    <Select
                      label="Authentication Protocol"
                      options={authProtocolOptions}
                      value={
                        editCredential.authProtocol ||
                        selectedCredential.authProtocol ||
                        "SHA-256"
                      }
                      onChange={(e) =>
                        setEditCredential({
                          ...editCredential,
                          authProtocol: e.target.value as
                            | "SHA"
                            | "SHA-224"
                            | "SHA-256"
                            | "SHA-384"
                            | "SHA-512",
                        })
                      }
                    />
                    <Input
                      label="Authentication Password"
                      type="password"
                      placeholder="Leave empty to keep existing"
                      value={editCredential.authPassword || ""}
                      onChange={(e) =>
                        setEditCredential({
                          ...editCredential,
                          authPassword: e.target.value,
                        })
                      }
                    />
                  </>
                )}

                {editShowPrivFields && (
                  <>
                    <Select
                      label="Privacy Protocol"
                      options={privProtocolOptions}
                      value={
                        editCredential.privProtocol ||
                        selectedCredential.privProtocol ||
                        "AES-256"
                      }
                      onChange={(e) =>
                        setEditCredential({
                          ...editCredential,
                          privProtocol: e.target.value as
                            | "AES"
                            | "AES-192"
                            | "AES-256",
                        })
                      }
                    />
                    <Input
                      label="Privacy Password"
                      type="password"
                      placeholder="Leave empty to keep existing"
                      value={editCredential.privPassword || ""}
                      onChange={(e) =>
                        setEditCredential({
                          ...editCredential,
                          privPassword: e.target.value,
                        })
                      }
                    />
                  </>
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditModalOpen(false)}
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

      {/* Test Credential Modal */}
      {isTestModalOpen && selectedCredential && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Test Credential: {selectedCredential.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleTestCredential} className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Test this SNMPv3 credential against a target device to verify
                  connectivity.
                </p>
                <Input
                  label="Target IP Address"
                  placeholder="e.g., 192.168.1.1"
                  value={testIp}
                  onChange={(e) => setTestIp(e.target.value)}
                  required
                />
                <Input
                  label="SNMP Port"
                  type="number"
                  placeholder="161"
                  value={testPort}
                  onChange={(e) => setTestPort(e.target.value)}
                />

                {testError && (
                  <div className="rounded-lg p-3 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400">
                    <p className="font-medium">Test Failed</p>
                    <p className="text-sm mt-1">{testError}</p>
                  </div>
                )}

                {testResult && (
                  <div
                    className={`rounded-lg p-4 ${testResult.error ? "bg-red-50 dark:bg-red-900/20" : "bg-green-50 dark:bg-green-900/20"}`}
                  >
                    {testResult.error ? (
                      <div className="text-red-800 dark:text-red-400">
                        <p className="font-medium">Connection Failed</p>
                        <p className="text-sm mt-1">{testResult.error}</p>
                        {testResult.responseTimeMs && (
                          <p className="text-xs mt-2 opacity-75">
                            Response time: {testResult.responseTimeMs}ms
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-green-800 dark:text-green-400">
                        <p className="font-medium flex items-center gap-2">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Connection Successful
                        </p>
                        <div className="mt-3 space-y-2 text-sm">
                          {testResult.sysName && (
                            <p><span className="font-medium">Device Name:</span> {testResult.sysName}</p>
                          )}
                          {testResult.sysDescr && (
                            <p><span className="font-medium">Description:</span> {testResult.sysDescr}</p>
                          )}
                          {testResult.sysUptime !== undefined && (
                            <p><span className="font-medium">Uptime:</span> {Math.floor(testResult.sysUptime / 86400)}d {Math.floor((testResult.sysUptime % 86400) / 3600)}h {Math.floor((testResult.sysUptime % 3600) / 60)}m</p>
                          )}
                          {testResult.sysContact && (
                            <p><span className="font-medium">Contact:</span> {testResult.sysContact}</p>
                          )}
                          {testResult.sysLocation && (
                            <p><span className="font-medium">Location:</span> {testResult.sysLocation}</p>
                          )}
                          {testResult.responseTimeMs && (
                            <p className="text-xs opacity-75 pt-1">
                              Response time: {testResult.responseTimeMs}ms
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsTestModalOpen(false)}
                  >
                    Close
                  </Button>
                  <Button type="submit" disabled={!testIp} loading={isLoading}>
                    Run Test
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
