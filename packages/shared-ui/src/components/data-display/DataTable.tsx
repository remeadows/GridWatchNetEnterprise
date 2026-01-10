import * as React from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type RowSelectionState,
  type OnChangeFn,
} from "@tanstack/react-table";
import { cn } from "../../utils/cn";
import { Button } from "../common/Button";

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  pageSize?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
  onRowClick?: (row: TData) => void;
  loading?: boolean;
  emptyMessage?: string;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  /** Function to get a unique ID for each row. When provided, row selection
   * uses these IDs instead of row indices, which fixes selection issues
   * when the table is filtered, sorted, or paginated. */
  getRowId?: (originalRow: TData, index: number) => string;
  /** Show page size selector with options to show more rows at once */
  showPageSizeSelector?: boolean;
  /** Available page size options */
  pageSizeOptions?: number[];
}

export function DataTable<TData>({
  columns,
  data,
  pageSize: initialPageSize = 10,
  searchable = false,
  searchPlaceholder = "Search...",
  onRowClick,
  loading = false,
  emptyMessage = "No data available",
  rowSelection,
  onRowSelectionChange,
  getRowId,
  showPageSizeSelector = false,
  pageSizeOptions = [10, 25, 50, 100],
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [pageSize, setPageSize] = React.useState(initialPageSize);
  const [internalRowSelection, setInternalRowSelection] =
    React.useState<RowSelectionState>({});

  // Use controlled or uncontrolled row selection
  const currentRowSelection = rowSelection ?? internalRowSelection;
  const handleRowSelectionChange: OnChangeFn<RowSelectionState> = (
    updaterOrValue,
  ) => {
    const newValue =
      typeof updaterOrValue === "function"
        ? updaterOrValue(currentRowSelection)
        : updaterOrValue;

    if (onRowSelectionChange) {
      onRowSelectionChange(newValue);
    } else {
      setInternalRowSelection(newValue);
    }
  };

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: handleRowSelectionChange,
    enableRowSelection: true,
    getRowId,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      rowSelection: currentRowSelection,
    },
    initialState: {
      pagination: {
        pageSize: initialPageSize,
      },
    },
  });

  // Update page size when it changes
  React.useEffect(() => {
    table.setPageSize(pageSize);
  }, [pageSize, table]);

  return (
    <div className="space-y-4">
      {searchable && (
        <div className="flex items-center gap-4">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="max-w-sm rounded-md border border-dark-600 bg-dark-800 px-3 py-2 text-sm text-silver-100 placeholder:text-silver-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-dark-900 transition-shadow focus:shadow-[0_0_10px_rgba(0,212,255,0.3)]"
          />
        </div>
      )}

      <div className="rounded-md border border-dark-700">
        <table className="w-full text-sm">
          <thead className="bg-dark-800">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      "px-4 py-3 text-left font-medium text-silver-300",
                      header.column.getCanSort() &&
                        "cursor-pointer select-none hover:text-primary-400",
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-2">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {header.column.getIsSorted() && (
                        <span>
                          {header.column.getIsSorted() === "asc" ? (
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
                                d="M5 15l7-7 7 7"
                              />
                            </svg>
                          ) : (
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
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-dark-700">
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-silver-400"
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg
                      className="h-5 w-5 animate-spin text-primary-500"
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
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Loading...
                  </div>
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-silver-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "bg-dark-900",
                    onRowClick &&
                      "cursor-pointer hover:bg-dark-800 transition-colors",
                  )}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-silver-100">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {(table.getPageCount() > 1 || showPageSizeSelector) && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm text-silver-400">
              Showing {table.getState().pagination.pageIndex * pageSize + 1} to{" "}
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * pageSize,
                data.length,
              )}{" "}
              of {data.length} results
            </span>
            {showPageSizeSelector && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-silver-400">Show:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPageSize(value === "all" ? data.length : Number(value));
                  }}
                  className="rounded-md border border-dark-600 bg-dark-800 px-2 py-1 text-sm text-silver-200"
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                  <option value="all">All</option>
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
