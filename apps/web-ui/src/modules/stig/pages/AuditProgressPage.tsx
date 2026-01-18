import { useEffect, useState, useCallback, useRef } from "react";
import {
  Button,
  Card,
  CardContent,
  Badge,
  StatusIndicator,
} from "@netnynja/shared-ui";
import {
  useSTIGStore,
  type AuditGroup,
  type AuditGroupSummary,
} from "../../../stores/stig";

export function STIGAuditProgressPage() {
  const {
    auditGroups,
    isLoading,
    fetchAuditGroups,
    fetchAuditGroup,
    fetchAuditGroupSummary,
  } = useSTIGStore();

  const [selectedGroup, setSelectedGroup] = useState<AuditGroup | null>(null);
  const [groupSummary, setGroupSummary] = useState<AuditGroupSummary | null>(
    null,
  );
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [pollingEnabled, setPollingEnabled] = useState(true);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // Initial fetch
  useEffect(() => {
    fetchAuditGroups();
  }, [fetchAuditGroups]);

  // Polling for running audit groups
  const pollRunningGroups = useCallback(async () => {
    if (!pollingEnabled) return;

    const runningGroups = auditGroups.filter(
      (g) => g.status === "pending" || g.status === "running",
    );

    if (runningGroups.length === 0) return;

    // Refresh all running groups
    for (const group of runningGroups) {
      try {
        await fetchAuditGroup(group.id);
      } catch {
        // Ignore errors during polling
      }
    }
  }, [auditGroups, pollingEnabled, fetchAuditGroup]);

  // Set up polling interval
  useEffect(() => {
    if (pollingEnabled) {
      pollingIntervalRef.current = setInterval(pollRunningGroups, 3000);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [pollingEnabled, pollRunningGroups]);

  // Open detail modal with full group info and summary
  const openDetailModal = async (group: AuditGroup) => {
    setSelectedGroup(group);
    setShowDetailModal(true);
    setGroupSummary(null);

    try {
      // Fetch fresh group data with jobs
      const freshGroup = await fetchAuditGroup(group.id);
      setSelectedGroup(freshGroup);

      // Fetch summary if completed
      if (freshGroup.status === "completed") {
        const summary = await fetchAuditGroupSummary(group.id);
        setGroupSummary(summary);
      }
    } catch {
      // Error handled in store
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "success";
      case "running":
        return "warning";
      case "failed":
        return "error";
      case "cancelled":
        return "neutral";
      case "pending":
      default:
        return "neutral";
    }
  };

  // Get compliance color
  const getComplianceColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 50) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  // Count groups by status
  const runningCount = auditGroups.filter(
    (g) => g.status === "pending" || g.status === "running",
  ).length;
  const completedCount = auditGroups.filter(
    (g) => g.status === "completed",
  ).length;
  const failedCount = auditGroups.filter((g) => g.status === "failed").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Audit Progress
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Track batch audit operations and view compliance summaries
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={pollingEnabled}
              onChange={(e) => setPollingEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Auto-refresh
          </label>
          <Button
            onClick={() => fetchAuditGroups()}
            variant="outline"
            className="border-gray-300 dark:border-gray-600"
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
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {auditGroups.length}
          </p>
          <p className="text-sm text-gray-500">Total Audit Groups</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {runningCount}
          </p>
          <p className="text-sm text-gray-500">In Progress</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {completedCount}
          </p>
          <p className="text-sm text-gray-500">Completed</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            {failedCount}
          </p>
          <p className="text-sm text-gray-500">Failed</p>
        </Card>
      </div>

      {/* Running Audits Section */}
      {runningCount > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Active Audits
            </h2>
            <div className="space-y-4">
              {auditGroups
                .filter((g) => g.status === "pending" || g.status === "running")
                .map((group) => (
                  <div
                    key={group.id}
                    className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-700 dark:bg-yellow-900/20"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900 dark:text-white">
                            {group.name}
                          </h3>
                          <Badge
                            variant={
                              group.status === "running"
                                ? "default"
                                : "secondary"
                            }
                            className={
                              group.status === "running"
                                ? "bg-yellow-500 text-white animate-pulse"
                                : ""
                            }
                          >
                            {group.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {group.targetName} | Started{" "}
                          {new Date(group.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                          {group.progressPercent}%
                        </p>
                        <p className="text-sm text-gray-500">
                          {group.completedJobs} / {group.totalJobs} jobs
                        </p>
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="mt-3">
                      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                        <div
                          className="h-2 rounded-full bg-yellow-500 transition-all duration-500"
                          style={{ width: `${group.progressPercent}%` }}
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDetailModal(group)}
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Audit Groups */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            All Audit Groups
          </h2>
          {isLoading && auditGroups.length === 0 ? (
            <div className="py-8 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              <p className="mt-2 text-gray-500">Loading audit groups...</p>
            </div>
          ) : auditGroups.length === 0 ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
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
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <p className="mt-2">No batch audits yet.</p>
              <p className="text-sm">
                Use "Audit All" on an asset to start a batch audit.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Target
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Progress
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Started
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {auditGroups.map((group) => (
                    <tr
                      key={group.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td className="whitespace-nowrap px-4 py-4">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {group.name}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-gray-600 dark:text-gray-400">
                        {group.targetName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <StatusIndicator
                          status={getStatusColor(group.status)}
                          label={group.status}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 rounded-full bg-gray-200 dark:bg-gray-700">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                group.status === "completed"
                                  ? "bg-green-500"
                                  : group.status === "failed"
                                    ? "bg-red-500"
                                    : "bg-yellow-500"
                              }`}
                              style={{ width: `${group.progressPercent}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-500">
                            {group.completedJobs}/{group.totalJobs}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-gray-600 dark:text-gray-400">
                        {new Date(group.createdAt).toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDetailModal(group)}
                        >
                          Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      {showDetailModal && selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {selectedGroup.name}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {selectedGroup.targetName}
                  </p>
                </div>
                <StatusIndicator
                  status={getStatusColor(selectedGroup.status)}
                  label={selectedGroup.status}
                />
              </div>

              {/* Progress Overview */}
              <div className="mt-6 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Progress</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {selectedGroup.progressPercent}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Jobs</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {selectedGroup.completedJobs} / {selectedGroup.totalJobs}
                    </p>
                  </div>
                  {groupSummary && (
                    <div>
                      <p className="text-sm text-gray-500">Compliance</p>
                      <p
                        className={`text-2xl font-bold ${getComplianceColor(
                          groupSummary.complianceScore,
                        )}`}
                      >
                        {groupSummary.complianceScore.toFixed(1)}%
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-500">Started</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {new Date(selectedGroup.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                {/* Full-width progress bar */}
                <div className="mt-4">
                  <div className="h-3 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${
                        selectedGroup.status === "completed"
                          ? "bg-green-500"
                          : selectedGroup.status === "failed"
                            ? "bg-red-500"
                            : "bg-yellow-500"
                      }`}
                      style={{ width: `${selectedGroup.progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Compliance Summary (if available) */}
              {groupSummary && (
                <div className="mt-6">
                  <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Compliance Summary ({groupSummary.totalStigs} STIGs)
                  </h3>
                  <div className="grid grid-cols-5 gap-4">
                    <div className="rounded-lg bg-green-50 p-3 text-center dark:bg-green-900/20">
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {groupSummary.passed}
                      </p>
                      <p className="text-xs text-gray-500">Passed</p>
                    </div>
                    <div className="rounded-lg bg-red-50 p-3 text-center dark:bg-red-900/20">
                      <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                        {groupSummary.failed}
                      </p>
                      <p className="text-xs text-gray-500">Failed</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 text-center dark:bg-gray-800">
                      <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                        {groupSummary.notApplicable}
                      </p>
                      <p className="text-xs text-gray-500">N/A</p>
                    </div>
                    <div className="rounded-lg bg-blue-50 p-3 text-center dark:bg-blue-900/20">
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {groupSummary.notReviewed}
                      </p>
                      <p className="text-xs text-gray-500">Not Reviewed</p>
                    </div>
                    <div className="rounded-lg bg-orange-50 p-3 text-center dark:bg-orange-900/20">
                      <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                        {groupSummary.errors}
                      </p>
                      <p className="text-xs text-gray-500">Errors</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Download Reports (for completed audits) */}
              {selectedGroup.status === "completed" && (
                <div className="mt-6">
                  <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Download Reports
                  </h3>
                  <div className="flex gap-4">
                    <a
                      href={`/api/v1/stig/audit-groups/${selectedGroup.id}/report/pdf`}
                      download
                      className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
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
                          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <div>
                        <p className="font-medium">Combined PDF Report</p>
                        <p className="text-xs opacity-75">
                          Summary + per-STIG compliance
                        </p>
                      </div>
                    </a>
                    <a
                      href={`/api/v1/stig/audit-groups/${selectedGroup.id}/report/ckl`}
                      download
                      className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
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
                          d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                        />
                      </svg>
                      <div>
                        <p className="font-medium">CKL Checklists (ZIP)</p>
                        <p className="text-xs opacity-75">
                          Individual .ckl files for STIG Viewer
                        </p>
                      </div>
                    </a>
                  </div>
                </div>
              )}

              {/* Individual Jobs */}
              <div className="mt-6">
                <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Individual Audit Jobs
                </h3>
                <div className="space-y-2">
                  {selectedGroup.jobs?.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                    >
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {job.stigTitle}
                        </p>
                        <p className="text-xs text-gray-500">
                          {job.startedAt
                            ? `Started: ${new Date(job.startedAt).toLocaleTimeString()}`
                            : "Pending"}
                          {job.completedAt &&
                            ` | Completed: ${new Date(
                              job.completedAt,
                            ).toLocaleTimeString()}`}
                        </p>
                      </div>
                      <StatusIndicator
                        status={getStatusColor(job.status)}
                        label={job.status}
                      />
                    </div>
                  ))}
                  {(!selectedGroup.jobs || selectedGroup.jobs.length === 0) && (
                    <p className="py-4 text-center text-sm text-gray-500">
                      No job details available yet.
                    </p>
                  )}
                </div>
              </div>

              {/* Per-STIG Breakdown (if summary available) */}
              {groupSummary && groupSummary.stigSummaries.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Per-STIG Compliance Breakdown
                  </h3>
                  <div className="space-y-2">
                    {groupSummary.stigSummaries.map((stig) => (
                      <div
                        key={stig.jobId}
                        className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {stig.stigTitle}
                            </p>
                            <p className="text-xs text-gray-500">
                              {stig.totalChecks} checks | {stig.passed} passed |{" "}
                              {stig.failed} failed
                            </p>
                          </div>
                          <div className="text-right">
                            <p
                              className={`text-lg font-semibold ${getComplianceColor(
                                stig.complianceScore,
                              )}`}
                            >
                              {stig.complianceScore.toFixed(1)}%
                            </p>
                          </div>
                        </div>
                        {/* Mini progress bar */}
                        <div className="mt-2">
                          <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                            <div
                              className={`h-1.5 rounded-full ${
                                stig.complianceScore >= 80
                                  ? "bg-green-500"
                                  : stig.complianceScore >= 50
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                              }`}
                              style={{ width: `${stig.complianceScore}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedGroup(null);
                    setGroupSummary(null);
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
