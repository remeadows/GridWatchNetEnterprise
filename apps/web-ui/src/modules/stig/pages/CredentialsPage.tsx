import { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  DataTable,
  Badge,
  Input,
  Select,
} from "@netnynja/shared-ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useSTIGStore } from "../../../stores/stig";
import type { SSHCredential, SSHCredentialInput } from "../../../stores/stig";

const columns: ColumnDef<SSHCredential>[] = [
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
    cell: ({ row }) => (
      <code className="rounded bg-gray-100 px-2 py-1 text-sm dark:bg-gray-800">
        {row.original.username}
      </code>
    ),
  },
  {
    accessorKey: "authType",
    header: "Auth Type",
    cell: ({ row }) => (
      <Badge
        variant={row.original.authType === "key" ? "secondary" : "default"}
      >
        {row.original.authType === "key" ? "SSH Key" : "Password"}
      </Badge>
    ),
  },
  {
    accessorKey: "sudoEnabled",
    header: "Sudo",
    cell: ({ row }) => (
      <Badge variant={row.original.sudoEnabled ? "default" : "outline"}>
        {row.original.sudoEnabled
          ? `sudo ${row.original.sudoUser}`
          : "Disabled"}
      </Badge>
    ),
  },
  {
    accessorKey: "defaultPort",
    header: "Default Port",
    cell: ({ row }) => row.original.defaultPort,
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => (
      <span className="text-gray-500 dark:text-gray-400">
        {row.original.description || "-"}
      </span>
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
  },
];

const authTypeOptions = [
  { value: "password", label: "Password" },
  { value: "key", label: "SSH Key" },
];

const sudoMethodOptions = [
  { value: "password", label: "Sudo Password" },
  { value: "same_as_ssh", label: "Same as SSH Password" },
  { value: "nopasswd", label: "NOPASSWD (sudoers)" },
];

export function STIGCredentialsPage() {
  const {
    sshCredentials,
    isLoading,
    fetchSSHCredentials,
    createSSHCredential,
    updateSSHCredential,
    deleteSSHCredential,
  } = useSTIGStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCredential, setSelectedCredential] =
    useState<SSHCredential | null>(null);

  const [newCredential, setNewCredential] = useState<SSHCredentialInput>({
    name: "",
    description: "",
    username: "",
    authType: "password",
    password: "",
    privateKey: "",
    keyPassphrase: "",
    defaultPort: 22,
    sudoEnabled: false,
    sudoMethod: "password",
    sudoPassword: "",
    sudoUser: "root",
  });

  const [editCredential, setEditCredential] = useState<SSHCredentialInput>({
    name: "",
    description: "",
    username: "",
    authType: "password",
    password: "",
    privateKey: "",
    keyPassphrase: "",
    defaultPort: 22,
    sudoEnabled: false,
    sudoMethod: "password",
    sudoPassword: "",
    sudoUser: "root",
  });

  useEffect(() => {
    fetchSSHCredentials();
  }, [fetchSSHCredentials]);

  const handleAddCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSSHCredential(newCredential);
      setShowAddModal(false);
      setNewCredential({
        name: "",
        description: "",
        username: "",
        authType: "password",
        password: "",
        privateKey: "",
        keyPassphrase: "",
        defaultPort: 22,
        sudoEnabled: false,
        sudoMethod: "password",
        sudoPassword: "",
        sudoUser: "root",
      });
    } catch {
      // Error handled in store
    }
  };

  const openEditModal = (credential: SSHCredential) => {
    setSelectedCredential(credential);
    setEditCredential({
      name: credential.name,
      description: credential.description || "",
      username: credential.username,
      authType: credential.authType,
      password: "",
      privateKey: "",
      keyPassphrase: "",
      defaultPort: credential.defaultPort,
      sudoEnabled: credential.sudoEnabled,
      sudoMethod: credential.sudoMethod,
      sudoPassword: "",
      sudoUser: credential.sudoUser,
    });
    setShowEditModal(true);
  };

  const handleEditCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCredential) return;
    try {
      // Only send non-empty password/key fields
      const updateData: Partial<SSHCredentialInput> = {
        name: editCredential.name,
        description: editCredential.description,
        username: editCredential.username,
        authType: editCredential.authType,
        defaultPort: editCredential.defaultPort,
        sudoEnabled: editCredential.sudoEnabled,
        sudoMethod: editCredential.sudoMethod,
        sudoUser: editCredential.sudoUser,
      };
      if (editCredential.password) {
        updateData.password = editCredential.password;
      }
      if (editCredential.privateKey) {
        updateData.privateKey = editCredential.privateKey;
      }
      if (editCredential.keyPassphrase) {
        updateData.keyPassphrase = editCredential.keyPassphrase;
      }
      if (editCredential.sudoPassword) {
        updateData.sudoPassword = editCredential.sudoPassword;
      }
      await updateSSHCredential(selectedCredential.id, updateData);
      setShowEditModal(false);
      setSelectedCredential(null);
    } catch {
      // Error handled in store
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            SSH Credentials
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Manage SSH credentials for STIG compliance auditing
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
          Add Credential
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {sshCredentials.length}
          </p>
          <p className="text-sm text-gray-500">Total Credentials</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {sshCredentials.filter((c) => c.authType === "password").length}
          </p>
          <p className="text-sm text-gray-500">Password Auth</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {sshCredentials.filter((c) => c.authType === "key").length}
          </p>
          <p className="text-sm text-gray-500">Key Auth</p>
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
                        openEditModal(row.original);
                      }}
                      className="border-gray-300 bg-white hover:bg-gray-100 dark:border-gray-500 dark:bg-gray-700 dark:hover:bg-gray-600"
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm("Delete this credential?")) {
                          deleteSSHCredential(row.original.id);
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
            data={sshCredentials}
            loading={isLoading}
            searchable
            searchPlaceholder="Search credentials..."
            emptyMessage="No SSH credentials configured. Add your first credential to begin."
          />
        </CardContent>
      </Card>

      {/* Add Credential Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Add SSH Credential
              </h2>
              <form onSubmit={handleAddCredential} className="space-y-4">
                <Input
                  label="Name"
                  value={newCredential.name}
                  onChange={(e) =>
                    setNewCredential({ ...newCredential, name: e.target.value })
                  }
                  placeholder="e.g., Production Linux Servers"
                  required
                />
                <Input
                  label="Description (optional)"
                  value={newCredential.description}
                  onChange={(e) =>
                    setNewCredential({
                      ...newCredential,
                      description: e.target.value,
                    })
                  }
                  placeholder="e.g., Credentials for RHEL 9 servers"
                />
                <Input
                  label="Username"
                  value={newCredential.username}
                  onChange={(e) =>
                    setNewCredential({
                      ...newCredential,
                      username: e.target.value,
                    })
                  }
                  placeholder="e.g., root or audit-user"
                  required
                />
                <Select
                  label="Authentication Type"
                  value={newCredential.authType}
                  onChange={(e) =>
                    setNewCredential({
                      ...newCredential,
                      authType: e.target.value as "password" | "key",
                    })
                  }
                  options={authTypeOptions}
                />
                {newCredential.authType === "password" && (
                  <Input
                    label="Password"
                    type="password"
                    value={newCredential.password}
                    onChange={(e) =>
                      setNewCredential({
                        ...newCredential,
                        password: e.target.value,
                      })
                    }
                    placeholder="Enter password"
                    required
                  />
                )}
                {newCredential.authType === "key" && (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Private Key
                      </label>
                      <textarea
                        value={newCredential.privateKey}
                        onChange={(e) =>
                          setNewCredential({
                            ...newCredential,
                            privateKey: e.target.value,
                          })
                        }
                        placeholder="Paste your private key here (-----BEGIN OPENSSH PRIVATE KEY-----...)"
                        rows={6}
                        required
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                      />
                    </div>
                    <Input
                      label="Key Passphrase (optional)"
                      type="password"
                      value={newCredential.keyPassphrase}
                      onChange={(e) =>
                        setNewCredential({
                          ...newCredential,
                          keyPassphrase: e.target.value,
                        })
                      }
                      placeholder="Enter passphrase if key is encrypted"
                    />
                  </>
                )}
                <Input
                  label="Default Port"
                  type="number"
                  value={newCredential.defaultPort}
                  onChange={(e) =>
                    setNewCredential({
                      ...newCredential,
                      defaultPort: parseInt(e.target.value) || 22,
                    })
                  }
                  placeholder="22"
                />

                {/* Sudo/Privilege Escalation Section */}
                <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                  <h3 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">
                    Privilege Escalation (Sudo)
                  </h3>
                  <div className="space-y-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newCredential.sudoEnabled}
                        onChange={(e) =>
                          setNewCredential({
                            ...newCredential,
                            sudoEnabled: e.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        Enable sudo for privilege escalation
                      </span>
                    </label>
                    {newCredential.sudoEnabled && (
                      <>
                        <Select
                          label="Sudo Method"
                          value={newCredential.sudoMethod}
                          onChange={(e) =>
                            setNewCredential({
                              ...newCredential,
                              sudoMethod: e.target.value as
                                | "password"
                                | "nopasswd"
                                | "same_as_ssh",
                            })
                          }
                          options={sudoMethodOptions}
                        />
                        {newCredential.sudoMethod === "password" && (
                          <Input
                            label="Sudo Password"
                            type="password"
                            value={newCredential.sudoPassword}
                            onChange={(e) =>
                              setNewCredential({
                                ...newCredential,
                                sudoPassword: e.target.value,
                              })
                            }
                            placeholder="Enter sudo password"
                            required
                          />
                        )}
                        <Input
                          label="Become User"
                          value={newCredential.sudoUser}
                          onChange={(e) =>
                            setNewCredential({
                              ...newCredential,
                              sudoUser: e.target.value,
                            })
                          }
                          placeholder="root"
                        />
                      </>
                    )}
                  </div>
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
                    Add Credential
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Credential Modal */}
      {showEditModal && selectedCredential && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Edit SSH Credential
              </h2>
              <form onSubmit={handleEditCredential} className="space-y-4">
                <Input
                  label="Name"
                  value={editCredential.name}
                  onChange={(e) =>
                    setEditCredential({
                      ...editCredential,
                      name: e.target.value,
                    })
                  }
                  placeholder="e.g., Production Linux Servers"
                  required
                />
                <Input
                  label="Description (optional)"
                  value={editCredential.description}
                  onChange={(e) =>
                    setEditCredential({
                      ...editCredential,
                      description: e.target.value,
                    })
                  }
                  placeholder="e.g., Credentials for RHEL 9 servers"
                />
                <Input
                  label="Username"
                  value={editCredential.username}
                  onChange={(e) =>
                    setEditCredential({
                      ...editCredential,
                      username: e.target.value,
                    })
                  }
                  placeholder="e.g., root or audit-user"
                  required
                />
                <Select
                  label="Authentication Type"
                  value={editCredential.authType}
                  onChange={(e) =>
                    setEditCredential({
                      ...editCredential,
                      authType: e.target.value as "password" | "key",
                    })
                  }
                  options={authTypeOptions}
                />
                {editCredential.authType === "password" && (
                  <Input
                    label="Password (leave empty to keep existing)"
                    type="password"
                    value={editCredential.password}
                    onChange={(e) =>
                      setEditCredential({
                        ...editCredential,
                        password: e.target.value,
                      })
                    }
                    placeholder="Enter new password or leave empty"
                  />
                )}
                {editCredential.authType === "key" && (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Private Key (leave empty to keep existing)
                      </label>
                      <textarea
                        value={editCredential.privateKey}
                        onChange={(e) =>
                          setEditCredential({
                            ...editCredential,
                            privateKey: e.target.value,
                          })
                        }
                        placeholder="Paste new private key or leave empty"
                        rows={6}
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                      />
                    </div>
                    <Input
                      label="Key Passphrase (leave empty to keep existing)"
                      type="password"
                      value={editCredential.keyPassphrase}
                      onChange={(e) =>
                        setEditCredential({
                          ...editCredential,
                          keyPassphrase: e.target.value,
                        })
                      }
                      placeholder="Enter new passphrase or leave empty"
                    />
                  </>
                )}
                <Input
                  label="Default Port"
                  type="number"
                  value={editCredential.defaultPort}
                  onChange={(e) =>
                    setEditCredential({
                      ...editCredential,
                      defaultPort: parseInt(e.target.value) || 22,
                    })
                  }
                  placeholder="22"
                />

                {/* Sudo/Privilege Escalation Section */}
                <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                  <h3 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">
                    Privilege Escalation (Sudo)
                  </h3>
                  <div className="space-y-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editCredential.sudoEnabled}
                        onChange={(e) =>
                          setEditCredential({
                            ...editCredential,
                            sudoEnabled: e.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        Enable sudo for privilege escalation
                      </span>
                    </label>
                    {editCredential.sudoEnabled && (
                      <>
                        <Select
                          label="Sudo Method"
                          value={editCredential.sudoMethod}
                          onChange={(e) =>
                            setEditCredential({
                              ...editCredential,
                              sudoMethod: e.target.value as
                                | "password"
                                | "nopasswd"
                                | "same_as_ssh",
                            })
                          }
                          options={sudoMethodOptions}
                        />
                        {editCredential.sudoMethod === "password" && (
                          <Input
                            label="Sudo Password (leave empty to keep existing)"
                            type="password"
                            value={editCredential.sudoPassword}
                            onChange={(e) =>
                              setEditCredential({
                                ...editCredential,
                                sudoPassword: e.target.value,
                              })
                            }
                            placeholder="Enter new sudo password or leave empty"
                          />
                        )}
                        <Input
                          label="Become User"
                          value={editCredential.sudoUser}
                          onChange={(e) =>
                            setEditCredential({
                              ...editCredential,
                              sudoUser: e.target.value,
                            })
                          }
                          placeholder="root"
                        />
                      </>
                    )}
                  </div>
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
    </div>
  );
}
