import { useEffect, useState, useCallback } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  DataTable,
  Badge,
  Input,
  StatusIndicator,
} from "@netnynja/shared-ui";
import type { ColumnDef } from "@tanstack/react-table";
import type { STIGDefinition } from "@netnynja/shared-types";
import {
  useSTIGStore,
  type STIGRule,
  type ImportHistoryEntry,
} from "../../../stores/stig";

const columns: ColumnDef<STIGDefinition>[] = [
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <span className="font-medium text-gray-900 dark:text-white">
        {row.original.title}
      </span>
    ),
  },
  {
    accessorKey: "stigId",
    header: "STIG ID",
    cell: ({ row }) => (
      <code className="rounded bg-gray-100 px-2 py-1 text-sm dark:bg-gray-800">
        {row.original.stigId}
      </code>
    ),
  },
  {
    accessorKey: "version",
    header: "Version",
    cell: ({ row }) => row.original.version || "-",
  },
  {
    accessorKey: "platform",
    header: "Platform",
    cell: ({ row }) => (
      <Badge variant="secondary">{row.original.platform}</Badge>
    ),
  },
  {
    accessorKey: "rulesCount",
    header: "Rules",
    cell: ({ row }) => row.original.rulesCount ?? "-",
  },
];

const ruleColumns: ColumnDef<STIGRule>[] = [
  {
    accessorKey: "ruleId",
    header: "Rule ID",
    cell: ({ row }) => <code className="text-xs">{row.original.ruleId}</code>,
  },
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => <span className="text-sm">{row.original.title}</span>,
  },
  {
    accessorKey: "severity",
    header: "Severity",
    cell: ({ row }) => {
      const severityColors = {
        high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        medium:
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
        low: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      };
      return (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            severityColors[row.original.severity] || ""
          }`}
        >
          {row.original.severity.toUpperCase()}
        </span>
      );
    },
  },
];

const importHistoryColumns: ColumnDef<ImportHistoryEntry>[] = [
  {
    accessorKey: "targetHostname",
    header: "Target",
    cell: ({ row }) => (
      <span className="font-medium text-gray-900 dark:text-white">
        {row.original.targetHostname}
      </span>
    ),
  },
  {
    accessorKey: "stigId",
    header: "STIG ID",
    cell: ({ row }) => (
      <code className="rounded bg-gray-100 px-2 py-1 text-sm dark:bg-gray-800">
        {row.original.stigId}
      </code>
    ),
  },
  {
    accessorKey: "stigTitle",
    header: "STIG Title",
    cell: ({ row }) => (
      <span className="text-sm">{row.original.stigTitle}</span>
    ),
  },
  {
    accessorKey: "resultsCount",
    header: "Results",
    cell: ({ row }) => row.original.resultsCount,
  },
  {
    accessorKey: "source",
    header: "Source",
    cell: ({ row }) => <Badge variant="secondary">{row.original.source}</Badge>,
  },
  {
    accessorKey: "importedAt",
    header: "Imported",
    cell: ({ row }) => new Date(row.original.importedAt).toLocaleString(),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const statusMap = {
        completed: "success",
        pending: "warning",
        running: "warning",
        failed: "error",
      } as const;
      return (
        <StatusIndicator
          status={
            statusMap[row.original.status as keyof typeof statusMap] ||
            "neutral"
          }
          label={
            row.original.status.charAt(0).toUpperCase() +
            row.original.status.slice(1)
          }
        />
      );
    },
  },
];

export function STIGLibraryPage() {
  const {
    benchmarks,
    selectedBenchmarkRules,
    importHistory,
    isLoading,
    isUploading,
    isImporting,
    error,
    fetchBenchmarks,
    fetchBenchmarkRules,
    uploadSTIG,
    deleteSTIG,
    importChecklist,
    fetchImportHistory,
  } = useSTIGStore();

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [selectedBenchmark, setSelectedBenchmark] =
    useState<STIGDefinition | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<"library" | "imports">("library");

  useEffect(() => {
    fetchBenchmarks();
    fetchImportHistory();
  }, [fetchBenchmarks, fetchImportHistory]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        if (!file.name.endsWith(".zip")) {
          setUploadError("Please select a .zip file");
          setSelectedFile(null);
        } else {
          setSelectedFile(file);
          setUploadError(null);
        }
      }
    },
    [],
  );

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    setUploadError(null);
    setUploadSuccess(null);

    try {
      const result = await uploadSTIG(selectedFile);
      setUploadSuccess(
        `Successfully imported "${result.title}" with ${result.rulesCount} rules`,
      );
      setSelectedFile(null);
      setTimeout(() => {
        setShowUploadModal(false);
        setUploadSuccess(null);
      }, 2000);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    }
  }, [selectedFile, uploadSTIG]);

  const handleViewRules = useCallback(
    async (benchmark: STIGDefinition) => {
      setSelectedBenchmark(benchmark);
      await fetchBenchmarkRules(benchmark.id);
      setShowRulesModal(true);
    },
    [fetchBenchmarkRules],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteSTIG(id);
        setShowDeleteConfirm(null);
      } catch {
        // Error is handled in store
      }
    },
    [deleteSTIG],
  );

  const handleImportFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const validExtensions = [".ckl", ".cklb", ".xml"];
        const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
        if (!validExtensions.includes(ext)) {
          setImportError("Please select a .ckl, .cklb, or .xml file");
          setImportFile(null);
        } else {
          setImportFile(file);
          setImportError(null);
        }
      }
    },
    [],
  );

  const handleImport = useCallback(async () => {
    if (!importFile) return;

    setImportError(null);
    setImportSuccess(null);

    try {
      const result = await importChecklist(importFile);
      setImportSuccess(
        `Successfully imported checklist for "${result.targetHostname}" with ${result.resultsCount} results`,
      );
      setImportFile(null);
      fetchImportHistory();
      setTimeout(() => {
        setShowImportModal(false);
        setImportSuccess(null);
      }, 2000);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    }
  }, [importFile, importChecklist, fetchImportHistory]);

  // Group benchmarks by platform
  const platformCounts = benchmarks.reduce(
    (acc, b) => {
      acc[b.platform] = (acc[b.platform] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            STIG Library
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Upload STIG definitions and import compliance checklists
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setShowImportModal(true)}
            className="border-gray-300 bg-white hover:bg-gray-100 dark:border-gray-500 dark:bg-gray-700 dark:hover:bg-gray-600"
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Import Checklist
          </Button>
          <Button
            onClick={() => setShowUploadModal(true)}
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
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            Upload STIG
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="rounded-lg bg-white/90 p-2 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-4">
          <button
            onClick={() => setActiveTab("library")}
            className={`py-2 px-4 rounded-md font-medium text-sm transition-colors ${
              activeTab === "library"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            STIG Library ({benchmarks.length})
          </button>
          <button
            onClick={() => setActiveTab("imports")}
            className={`py-2 px-4 rounded-md font-medium text-sm transition-colors ${
              activeTab === "imports"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            Import History ({importHistory.length})
          </button>
        </nav>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Library Tab Content */}
      {activeTab === "library" && (
        <>
          {/* Platform Summary */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {Object.entries(platformCounts).map(([platform, count]) => (
              <Card key={platform} className="p-4 text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {count}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {platform}
                </p>
              </Card>
            ))}
            {benchmarks.length === 0 && !isLoading && (
              <Card className="col-span-full p-8 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                  No STIGs uploaded
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Get started by uploading a STIG .zip file from DISA
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setShowUploadModal(true)}
                >
                  Upload STIG
                </Button>
              </Card>
            )}
          </div>

          {/* STIG List */}
          {benchmarks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Uploaded STIGs ({benchmarks.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={[
                    ...columns,
                    {
                      id: "actions",
                      header: "Actions",
                      cell: ({ row }) => (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewRules(row.original)}
                            className="border-gray-300 bg-white hover:bg-gray-100 dark:border-gray-500 dark:bg-gray-700 dark:hover:bg-gray-600"
                          >
                            View Rules
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                            onClick={() =>
                              setShowDeleteConfirm(row.original.id)
                            }
                          >
                            Delete
                          </Button>
                        </div>
                      ),
                    },
                  ]}
                  data={benchmarks}
                  loading={isLoading}
                  searchable
                  searchPlaceholder="Search STIGs..."
                />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Import History Tab Content */}
      {activeTab === "imports" && (
        <>
          {importHistory.length === 0 && !isLoading ? (
            <Card className="p-8 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                No checklists imported
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Import STIG Viewer checklist files (.ckl, .cklb) or XCCDF
                results (.xml)
              </p>
              <Button className="mt-4" onClick={() => setShowImportModal(true)}>
                Import Checklist
              </Button>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>
                  Imported Checklists ({importHistory.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={importHistoryColumns}
                  data={importHistory}
                  loading={isLoading}
                  searchable
                  searchPlaceholder="Search imports..."
                />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Upload STIG File
            </h3>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Upload a STIG .zip file from DISA. The file should contain an
              XCCDF XML document.
            </p>

            {uploadError && (
              <div className="mb-4 rounded-md bg-red-50 p-3 dark:bg-red-900/20">
                <p className="text-sm text-red-700 dark:text-red-400">
                  {uploadError}
                </p>
              </div>
            )}

            {uploadSuccess && (
              <div className="mb-4 rounded-md bg-green-50 p-3 dark:bg-green-900/20">
                <p className="text-sm text-green-700 dark:text-green-400">
                  {uploadSuccess}
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                STIG File (.zip)
              </label>
              <div className="mt-1 flex items-center gap-4">
                <Input
                  type="file"
                  accept=".zip"
                  onChange={handleFileSelect}
                  className="flex-1"
                />
              </div>
              {selectedFile && (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Selected: {selectedFile.name} (
                  {(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowUploadModal(false);
                  setSelectedFile(null);
                  setUploadError(null);
                  setUploadSuccess(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
              >
                {isUploading ? (
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
                    Uploading...
                  </>
                ) : (
                  "Upload"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Rules Modal */}
      {showRulesModal && selectedBenchmark && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-4xl max-h-[80vh] overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800">
            <div className="border-b border-gray-200 p-4 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {selectedBenchmark.title}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedBenchmarkRules.length} rules
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowRulesModal(false);
                    setSelectedBenchmark(null);
                  }}
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </Button>
              </div>
            </div>
            <div
              className="overflow-auto p-4"
              style={{ maxHeight: "calc(80vh - 80px)" }}
            >
              <DataTable
                columns={ruleColumns}
                data={selectedBenchmarkRules}
                loading={isLoading}
                searchable
                searchPlaceholder="Search rules..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Import Checklist Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Import Checklist
            </h3>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Import a STIG Viewer checklist file (.ckl, .cklb) or XCCDF results
              (.xml). The checklist contains compliance results that will be
              imported as an audit job.
            </p>

            {importError && (
              <div className="mb-4 rounded-md bg-red-50 p-3 dark:bg-red-900/20">
                <p className="text-sm text-red-700 dark:text-red-400">
                  {importError}
                </p>
              </div>
            )}

            {importSuccess && (
              <div className="mb-4 rounded-md bg-green-50 p-3 dark:bg-green-900/20">
                <p className="text-sm text-green-700 dark:text-green-400">
                  {importSuccess}
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Checklist File (.ckl, .cklb, .xml)
              </label>
              <div className="mt-1 flex items-center gap-4">
                <Input
                  type="file"
                  accept=".ckl,.cklb,.xml"
                  onChange={handleImportFileSelect}
                  className="flex-1"
                />
              </div>
              {importFile && (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Selected: {importFile.name} (
                  {(importFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            <div className="mb-4 rounded-md bg-blue-50 p-3 dark:bg-blue-900/20">
              <p className="text-xs text-blue-700 dark:text-blue-400">
                <strong>Supported formats:</strong>
              </p>
              <ul className="mt-1 text-xs text-blue-700 dark:text-blue-400 list-disc list-inside">
                <li>.ckl - STIG Viewer Checklist (XML format)</li>
                <li>.cklb - STIG Viewer Checklist (JSON format)</li>
                <li>.xml - XCCDF results or CKL files</li>
              </ul>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                  setImportError(null);
                  setImportSuccess(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={!importFile || isImporting}
              >
                {isImporting ? (
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
                    Importing...
                  </>
                ) : (
                  "Import"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Delete STIG
            </h3>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Are you sure you want to delete this STIG? This action cannot be
              undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(null)}
                className="border-gray-300 bg-white hover:bg-gray-100 dark:border-gray-500 dark:bg-gray-700 dark:hover:bg-gray-600"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDelete(showDeleteConfirm)}
                className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
