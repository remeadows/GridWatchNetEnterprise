import { useEffect } from "react";
import { Card, CardContent, DataTable, Badge } from "@netnynja/shared-ui";
import type { ColumnDef } from "@tanstack/react-table";
import type { STIGDefinition } from "@netnynja/shared-types";
import { useSTIGStore } from "../../../stores/stig";

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
    cell: ({ row }) => row.original.rulesCount,
  },
  {
    accessorKey: "releaseDate",
    header: "Release Date",
    cell: ({ row }) =>
      row.original.releaseDate
        ? new Date(row.original.releaseDate).toLocaleDateString()
        : "-",
  },
];

export function STIGBenchmarksPage() {
  const { benchmarks, isLoading, fetchBenchmarks } = useSTIGStore();

  useEffect(() => {
    fetchBenchmarks();
  }, [fetchBenchmarks]);

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
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          STIG Benchmarks
        </h1>
        <p className="text-gray-300 dark:text-gray-300">
          Security Technical Implementation Guides for compliance auditing
        </p>
      </div>

      {/* Platform Summary */}
      {Object.keys(platformCounts).length > 0 && (
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
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={benchmarks}
            loading={isLoading}
            searchable
            searchPlaceholder="Search benchmarks..."
            emptyMessage="No STIG benchmarks loaded. Import benchmarks to begin compliance auditing."
          />
        </CardContent>
      </Card>
    </div>
  );
}
