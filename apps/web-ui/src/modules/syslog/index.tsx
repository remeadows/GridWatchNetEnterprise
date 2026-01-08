/**
 * Syslog Module
 *
 * Provides centralized syslog collection, filtering, and analysis.
 */

export { SyslogEventsPage as EventsPage } from "./pages/EventsPage";
export { SyslogSourcesPage as SourcesPage } from "./pages/SourcesPage";
export { SyslogFiltersPage as FiltersPage } from "./pages/FiltersPage";

// Module metadata
export const syslogModuleConfig = {
  name: "Syslog",
  description: "Centralized syslog collection and analysis",
  icon: "document-report",
  basePath: "/syslog",
  routes: [
    { path: "/syslog", label: "Events", icon: "clipboard-list" },
    { path: "/syslog/sources", label: "Sources", icon: "server" },
    { path: "/syslog/filters", label: "Filters", icon: "filter" },
  ],
};
