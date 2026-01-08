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
import type { User, UserRole } from "@netnynja/shared-types";
import {
  useUsersStore,
  type CreateUserInput,
  type UpdateUserInput,
} from "../../../stores/users";
import { useAuthStore } from "../../../stores/auth";

const roleOptions = [
  { value: "admin", label: "Admin" },
  { value: "operator", label: "Operator" },
  { value: "viewer", label: "Viewer" },
];

export function UsersPage() {
  const {
    users,
    pagination,
    isLoading,
    error,
    fetchUsers,
    createUser,
    updateUser,
    deleteUser,
    resetPassword,
    unlockUser,
  } = useUsersStore();
  const { user: currentUser } = useAuthStore();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] =
    useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [newUser, setNewUser] = useState<CreateUserInput>({
    username: "",
    email: "",
    password: "",
    role: "viewer",
    isActive: true,
  });

  const [editUser, setEditUser] = useState<UpdateUserInput>({
    email: "",
    role: undefined,
    isActive: true,
  });

  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = () => {
    fetchUsers({ search: searchQuery, page: 1 });
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser(newUser);
      setIsCreateModalOpen(false);
      setNewUser({
        username: "",
        email: "",
        password: "",
        role: "viewer",
        isActive: true,
      });
    } catch {
      // Error is handled in store
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      await updateUser(selectedUser.id, editUser);
      setIsEditModalOpen(false);
      setSelectedUser(null);
    } catch {
      // Error is handled in store
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (user.id === currentUser?.id) {
      alert("You cannot delete your own account");
      return;
    }
    if (
      window.confirm(`Are you sure you want to delete user "${user.username}"?`)
    ) {
      try {
        await deleteUser(user.id);
      } catch {
        // Error is handled in store
      }
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !newPassword) return;
    try {
      await resetPassword(selectedUser.id, newPassword);
      setIsResetPasswordModalOpen(false);
      setSelectedUser(null);
      setNewPassword("");
      alert("Password reset successfully");
    } catch {
      // Error is handled in store
    }
  };

  const handleUnlockUser = async (user: User) => {
    try {
      await unlockUser(user.id);
      alert(`User "${user.username}" has been unlocked`);
    } catch {
      // Error is handled in store
    }
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setEditUser({
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    });
    setIsEditModalOpen(true);
  };

  const openResetPasswordModal = (user: User) => {
    setSelectedUser(user);
    setNewPassword("");
    setIsResetPasswordModalOpen(true);
  };

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: "username",
      header: "Username",
      cell: ({ row }) => (
        <span className="font-medium text-gray-900 dark:text-white">
          {row.original.username}
        </span>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => {
        const roleVariants = {
          admin: "error",
          operator: "warning",
          viewer: "default",
        } as const;
        return (
          <Badge variant={roleVariants[row.original.role] || "default"}>
            {row.original.role.charAt(0).toUpperCase() +
              row.original.role.slice(1)}
          </Badge>
        );
      },
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
      accessorKey: "failedLoginAttempts",
      header: "Failed Logins",
      cell: ({ row }) => {
        const attempts = row.original.failedLoginAttempts || 0;
        return (
          <span className={attempts >= 3 ? "font-medium text-red-600" : ""}>
            {attempts}
          </span>
        );
      },
    },
    {
      accessorKey: "lastLogin",
      header: "Last Login",
      cell: ({ row }) =>
        row.original.lastLogin
          ? new Date(row.original.lastLogin).toLocaleString()
          : "Never",
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const user = row.original;
        const isCurrentUser = user.id === currentUser?.id;
        return (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openEditModal(user);
              }}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openResetPasswordModal(user);
              }}
            >
              Reset
            </Button>
            {(user.failedLoginAttempts || 0) >= 3 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUnlockUser(user);
                }}
              >
                Unlock
              </Button>
            )}
            {!isCurrentUser && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteUser(user);
                }}
              >
                Delete
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            User Management
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Manage user accounts, roles, and permissions
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
          Add User
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Users ({pagination?.total || users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-2">
            <Input
              placeholder="Search by username or email..."
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
            data={users}
            loading={isLoading}
            emptyMessage="No users found"
          />
        </CardContent>
      </Card>

      {/* Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Add New User</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <Input
                  label="Username"
                  placeholder="Enter username"
                  value={newUser.username}
                  onChange={(e) =>
                    setNewUser({ ...newUser, username: e.target.value })
                  }
                  required
                />
                <Input
                  label="Email"
                  type="email"
                  placeholder="Enter email"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                  required
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="Enter password (min 8 characters)"
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                  required
                />
                <Select
                  label="Role"
                  options={roleOptions}
                  value={newUser.role || "viewer"}
                  onChange={(e) =>
                    setNewUser({ ...newUser, role: e.target.value as UserRole })
                  }
                />
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="createIsActive"
                    checked={newUser.isActive}
                    onChange={(e) =>
                      setNewUser({ ...newUser, isActive: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label
                    htmlFor="createIsActive"
                    className="text-sm text-gray-700 dark:text-gray-300"
                  >
                    Active
                  </label>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      !newUser.username || !newUser.email || !newUser.password
                    }
                    loading={isLoading}
                  >
                    Create User
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit User Modal */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Edit User: {selectedUser.username}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEditUser} className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  placeholder="Enter email"
                  value={editUser.email || ""}
                  onChange={(e) =>
                    setEditUser({ ...editUser, email: e.target.value })
                  }
                />
                <Select
                  label="Role"
                  options={roleOptions}
                  value={editUser.role || selectedUser.role}
                  onChange={(e) =>
                    setEditUser({
                      ...editUser,
                      role: e.target.value as UserRole,
                    })
                  }
                />
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="editIsActive"
                    checked={editUser.isActive}
                    onChange={(e) =>
                      setEditUser({ ...editUser, isActive: e.target.checked })
                    }
                    disabled={selectedUser.id === currentUser?.id}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <label
                    htmlFor="editIsActive"
                    className="text-sm text-gray-700 dark:text-gray-300"
                  >
                    Active
                    {selectedUser.id === currentUser?.id && (
                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                        (Cannot disable your own account)
                      </span>
                    )}
                  </label>
                </div>
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

      {/* Reset Password Modal */}
      {isResetPasswordModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Reset Password: {selectedUser.username}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <Input
                  label="New Password"
                  type="password"
                  placeholder="Enter new password (min 8 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsResetPasswordModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={newPassword.length < 8}
                    loading={isLoading}
                  >
                    Reset Password
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
