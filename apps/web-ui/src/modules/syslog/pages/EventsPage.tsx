import { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Input,
} from "@gridwatch/shared-ui";
import { useSyslogStore } from "../../../stores/syslog";

const severityColors: Record<
  string,
  "error" | "warning" | "default" | "secondary" | "success"
> = {
  emergency: "error",
  alert: "error",
  critical: "error",
  error: "error",
  warning: "warning",
  notice: "default",
  informational: "secondary",
  debug: "secondary",
};

export function SyslogEventsPage() {
  const {
    events,
    eventsPagination,
    eventStats,
    eventsFilters,
    isLoading,
    fetchEvents,
    fetchEventStats,
    setEventsFilters,
  } = useSyslogStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("");

  useEffect(() => {
    fetchEvents();
    fetchEventStats(24);
  }, [fetchEvents, fetchEventStats]);

  const handleSearch = () => {
    setEventsFilters({
      ...eventsFilters,
      search: searchQuery || undefined,
      severity: selectedSeverity || undefined,
    });
    fetchEvents(1, {
      ...eventsFilters,
      search: searchQuery || undefined,
      severity: selectedSeverity || undefined,
    });
  };

  const handleRefresh = () => {
    fetchEvents(1, eventsFilters);
    fetchEventStats(24);
  };

  const handleSeverityChange = (value: string) => {
    setSelectedSeverity(value);
    const newFilters = {
      ...eventsFilters,
      severity: value || undefined,
    };
    setEventsFilters(newFilters);
    fetchEvents(1, newFilters);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Syslog Events
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Real-time syslog event monitoring and analysis
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
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
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Export
          </Button>
          <Button onClick={handleRefresh} disabled={isLoading}>
            <svg
              className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
        <Card className="p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {eventStats?.totals.events.toLocaleString() || "0"}
          </p>
          <p className="text-sm text-gray-500">Total Events (24h)</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-red-600">
            {eventStats?.totals.criticalAndAbove || 0}
          </p>
          <p className="text-sm text-gray-500">Critical & Above</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-amber-600">
            {eventStats?.bySeverity.find((s) => s.severity === "warning")
              ?.count || 0}
          </p>
          <p className="text-sm text-gray-500">Warnings</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {eventStats?.topSources.length || 0}
          </p>
          <p className="text-sm text-gray-500">Active Sources</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-green-600">
            {eventStats?.bySeverity.find((s) => s.severity === "informational")
              ?.count || 0}
          </p>
          <p className="text-sm text-gray-500">Informational</p>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Event Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-4">
            <div className="flex flex-1 gap-2">
              <Input
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="max-w-sm"
              />
              <Button variant="outline" onClick={handleSearch}>
                Search
              </Button>
            </div>
            <select
              value={selectedSeverity}
              onChange={(e) => handleSeverityChange(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">All Severities</option>
              <option value="emergency">Emergency</option>
              <option value="alert">Alert</option>
              <option value="critical">Critical</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="notice">Notice</option>
              <option value="informational">Informational</option>
              <option value="debug">Debug</option>
            </select>
          </div>

          {/* Event List */}
          {isLoading && events.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              Loading events...
            </div>
          ) : events.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              No syslog events received yet. Configure sources to start
              receiving events.
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-4 rounded-lg border border-gray-200 p-4 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    <Badge
                      variant={severityColors[event.severity] || "secondary"}
                    >
                      {event.severity.toUpperCase()}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {event.hostname || "Unknown"}
                        </span>
                        <span className="text-sm text-gray-500">
                          [{event.facility}]
                        </span>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">
                          {event.sourceIp}
                        </code>
                        {event.deviceType && (
                          <Badge variant="secondary" className="text-xs">
                            {event.deviceType}
                          </Badge>
                        )}
                        {event.eventType && (
                          <Badge variant="default" className="text-xs">
                            {event.eventType}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                        {event.message}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {new Date(event.receivedAt).toLocaleString()}
                        {event.appName && ` • ${event.appName}`}
                        {event.procId && `[${event.procId}]`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {eventsPagination && eventsPagination.pages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    Showing {events.length} of{" "}
                    {eventsPagination.total.toLocaleString()} events
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={eventsPagination.page === 1}
                      onClick={() =>
                        fetchEvents(eventsPagination.page - 1, eventsFilters)
                      }
                    >
                      Previous
                    </Button>
                    <span className="flex items-center px-2 text-sm text-gray-500">
                      Page {eventsPagination.page} of {eventsPagination.pages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        eventsPagination.page === eventsPagination.pages
                      }
                      onClick={() =>
                        fetchEvents(eventsPagination.page + 1, eventsFilters)
                      }
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
