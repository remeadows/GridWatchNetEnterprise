/**
 * NetNynja Enterprise - NPM Reports API Routes
 * PDF and CSV export functionality for NPM Status/Health reports
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { pool } from "../../db";
import PdfPrinter from "pdfmake";
import type {
  TDocumentDefinitions,
  Content,
  TableCell,
} from "pdfmake/interfaces";

// PDF fonts configuration
const fonts = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

const printer = new PdfPrinter(fonts);

// Query schema for report parameters
const reportQuerySchema = z.object({
  format: z.enum(["pdf", "csv"]).default("pdf"),
  includeMetrics: z.coerce.boolean().default(true),
  includeAlerts: z.coerce.boolean().default(true),
  deviceStatus: z.enum(["all", "up", "down", "unknown"]).optional(),
});

// Helper to format bytes
const formatBytes = (bytes: number | null): string => {
  if (bytes === null) return "N/A";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let value = bytes;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
};

// Helper to format date
const formatDate = (date: Date): string => {
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
};

const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  // Require authentication for all report routes
  fastify.addHook("preHandler", fastify.requireAuth);

  // Generate NPM Health Report (PDF/CSV)
  fastify.get(
    "/health",
    {
      schema: {
        tags: ["NPM - Reports"],
        summary: "Export NPM health report",
        description: "Generate a PDF or CSV report of NPM device health status",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            format: { type: "string", enum: ["pdf", "csv"], default: "pdf" },
            includeMetrics: { type: "boolean", default: true },
            includeAlerts: { type: "boolean", default: true },
            deviceStatus: {
              type: "string",
              enum: ["all", "up", "down", "unknown"],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const query = reportQuerySchema.parse(request.query);
      const now = new Date();

      // Get summary statistics
      const summaryResult = await pool.query(`
        SELECT
          COUNT(*) as total_devices,
          COUNT(*) FILTER (WHERE is_active) as active_devices,
          COUNT(*) FILTER (WHERE status = 'up') as devices_up,
          COUNT(*) FILTER (WHERE status = 'down') as devices_down,
          COUNT(*) FILTER (WHERE status = 'unknown') as devices_unknown
        FROM npm.devices
      `);

      // Get device list with status filter
      let deviceQuery = `
        SELECT d.id, d.name, d.ip_address, d.device_type, d.vendor, d.model,
               d.status, d.icmp_status, d.snmp_status, d.last_poll, d.poll_interval,
               d.is_active
        FROM npm.devices d
        WHERE d.is_active = true
      `;
      const queryParams: unknown[] = [];

      if (query.deviceStatus && query.deviceStatus !== "all") {
        queryParams.push(query.deviceStatus);
        deviceQuery += ` AND d.status = $${queryParams.length}`;
      }

      deviceQuery += " ORDER BY d.name";

      const devicesResult = await pool.query(deviceQuery, queryParams);

      // Get latest metrics for each device if requested
      let metricsMap = new Map<
        string,
        {
          latencyMs: number | null;
          cpuPercent: number | null;
          memoryPercent: number | null;
          availability24h: number | null;
        }
      >();

      if (query.includeMetrics) {
        const metricsResult = await pool.query(`
          WITH latest_metrics AS (
            SELECT DISTINCT ON (device_id)
              device_id,
              icmp_latency_ms,
              cpu_utilization_percent,
              memory_utilization_percent
            FROM npm.device_metrics
            WHERE collected_at >= NOW() - INTERVAL '1 hour'
            ORDER BY device_id, collected_at DESC
          ),
          availability_24h AS (
            SELECT
              device_id,
              (COUNT(*) FILTER (WHERE is_available) * 100.0 / NULLIF(COUNT(*), 0)) as availability
            FROM npm.device_metrics
            WHERE collected_at >= NOW() - INTERVAL '24 hours'
            GROUP BY device_id
          )
          SELECT
            d.id,
            lm.icmp_latency_ms,
            lm.cpu_utilization_percent,
            lm.memory_utilization_percent,
            a.availability
          FROM npm.devices d
          LEFT JOIN latest_metrics lm ON d.id = lm.device_id
          LEFT JOIN availability_24h a ON d.id = a.device_id
          WHERE d.is_active = true
        `);

        metricsResult.rows.forEach((row) => {
          metricsMap.set(row.id, {
            latencyMs: row.icmp_latency_ms
              ? parseFloat(row.icmp_latency_ms)
              : null,
            cpuPercent: row.cpu_utilization_percent
              ? parseFloat(row.cpu_utilization_percent)
              : null,
            memoryPercent: row.memory_utilization_percent
              ? parseFloat(row.memory_utilization_percent)
              : null,
            availability24h: row.availability
              ? parseFloat(row.availability)
              : null,
          });
        });
      }

      // Get active alerts if requested
      let alerts: Array<{
        deviceName: string;
        severity: string;
        message: string;
        triggeredAt: Date;
      }> = [];

      if (query.includeAlerts) {
        const alertsResult = await pool.query(`
          SELECT a.severity, a.message, a.triggered_at, d.name as device_name
          FROM npm.alerts a
          JOIN npm.devices d ON a.device_id = d.id
          WHERE a.status = 'active'
          ORDER BY
            CASE a.severity
              WHEN 'critical' THEN 1
              WHEN 'warning' THEN 2
              ELSE 3
            END,
            a.triggered_at DESC
          LIMIT 50
        `);
        alerts = alertsResult.rows;
      }

      const summary = summaryResult.rows[0];
      const devices = devicesResult.rows;

      // Generate CSV format
      if (query.format === "csv") {
        const headers = [
          "Name",
          "IP Address",
          "Type",
          "Vendor",
          "Model",
          "Status",
          "ICMP Status",
          "SNMP Status",
          "Last Poll",
        ];

        if (query.includeMetrics) {
          headers.push(
            "Latency (ms)",
            "CPU %",
            "Memory %",
            "Availability 24h %",
          );
        }

        const rows = devices.map((device) => {
          const row = [
            device.name,
            device.ip_address,
            device.device_type || "",
            device.vendor || "",
            device.model || "",
            device.status,
            device.icmp_status,
            device.snmp_status,
            device.last_poll ? formatDate(new Date(device.last_poll)) : "",
          ];

          if (query.includeMetrics) {
            const metrics = metricsMap.get(device.id);
            row.push(
              metrics?.latencyMs?.toFixed(1) || "",
              metrics?.cpuPercent?.toFixed(1) || "",
              metrics?.memoryPercent?.toFixed(1) || "",
              metrics?.availability24h?.toFixed(2) || "",
            );
          }

          return row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
        });

        const csv = [headers.join(","), ...rows].join("\n");

        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header(
          "Content-Disposition",
          `attachment; filename="npm-health-report-${now.toISOString().split("T")[0]}.csv"`,
        );
        return csv;
      }

      // Generate PDF format
      const statusColor = (status: string): string => {
        switch (status) {
          case "up":
            return "#10b981"; // green
          case "down":
            return "#ef4444"; // red
          default:
            return "#6b7280"; // gray
        }
      };

      const severityColor = (severity: string): string => {
        switch (severity) {
          case "critical":
            return "#ef4444"; // red
          case "warning":
            return "#f59e0b"; // amber
          default:
            return "#3b82f6"; // blue
        }
      };

      // Build device table rows
      const deviceTableBody: TableCell[][] = [
        [
          { text: "Device", style: "tableHeader" },
          { text: "IP Address", style: "tableHeader" },
          { text: "Type", style: "tableHeader" },
          { text: "Status", style: "tableHeader" },
          ...(query.includeMetrics
            ? [
                { text: "Latency", style: "tableHeader" },
                { text: "CPU", style: "tableHeader" },
                { text: "Memory", style: "tableHeader" },
                { text: "Avail 24h", style: "tableHeader" },
              ]
            : []),
        ] as TableCell[],
      ];

      devices.forEach((device) => {
        const metrics = metricsMap.get(device.id);
        const row: TableCell[] = [
          { text: device.name, style: "tableCell" },
          { text: device.ip_address, style: "tableCell" },
          { text: device.device_type || "-", style: "tableCell" },
          {
            text: device.status.toUpperCase(),
            style: "tableCell",
            color: statusColor(device.status),
          },
        ];

        if (query.includeMetrics) {
          row.push(
            {
              text: metrics?.latencyMs
                ? `${metrics.latencyMs.toFixed(1)} ms`
                : "-",
              style: "tableCell",
            },
            {
              text: metrics?.cpuPercent
                ? `${metrics.cpuPercent.toFixed(1)}%`
                : "-",
              style: "tableCell",
            },
            {
              text: metrics?.memoryPercent
                ? `${metrics.memoryPercent.toFixed(1)}%`
                : "-",
              style: "tableCell",
            },
            {
              text: metrics?.availability24h
                ? `${metrics.availability24h.toFixed(2)}%`
                : "-",
              style: "tableCell",
            },
          );
        }

        deviceTableBody.push(row);
      });

      // Build alerts table if included
      const alertsContent: Content[] = [];
      if (query.includeAlerts && alerts.length > 0) {
        const alertsTableBody: TableCell[][] = [
          [
            { text: "Device", style: "tableHeader" },
            { text: "Severity", style: "tableHeader" },
            { text: "Message", style: "tableHeader" },
            { text: "Time", style: "tableHeader" },
          ],
        ];

        alerts.forEach((alert) => {
          alertsTableBody.push([
            { text: alert.deviceName, style: "tableCell" },
            {
              text: alert.severity.toUpperCase(),
              style: "tableCell",
              color: severityColor(alert.severity),
            },
            { text: alert.message, style: "tableCell" },
            {
              text: formatDate(new Date(alert.triggeredAt)),
              style: "tableCell",
            },
          ]);
        });

        alertsContent.push(
          {
            text: "Active Alerts",
            style: "sectionHeader",
            margin: [0, 20, 0, 10],
          },
          {
            table: {
              headerRows: 1,
              widths: ["20%", "15%", "40%", "25%"],
              body: alertsTableBody,
            },
            layout: "lightHorizontalLines",
          },
        );
      }

      // PDF Document definition
      const docDefinition: TDocumentDefinitions = {
        pageSize: "LETTER",
        pageMargins: [40, 60, 40, 60],
        defaultStyle: {
          font: "Helvetica",
          fontSize: 10,
        },
        styles: {
          header: {
            fontSize: 20,
            bold: true,
            color: "#1f2937",
            margin: [0, 0, 0, 10],
          },
          subheader: {
            fontSize: 12,
            color: "#6b7280",
            margin: [0, 0, 0, 20],
          },
          sectionHeader: {
            fontSize: 14,
            bold: true,
            color: "#1f2937",
          },
          summaryLabel: {
            fontSize: 10,
            color: "#6b7280",
          },
          summaryValue: {
            fontSize: 16,
            bold: true,
            color: "#1f2937",
          },
          tableHeader: {
            fontSize: 9,
            bold: true,
            color: "#374151",
            fillColor: "#f3f4f6",
            margin: [4, 6, 4, 6],
          },
          tableCell: {
            fontSize: 9,
            color: "#1f2937",
            margin: [4, 4, 4, 4],
          },
          footer: {
            fontSize: 8,
            color: "#9ca3af",
          },
        },
        header: {
          columns: [
            {
              text: "NetNynja Enterprise",
              style: { fontSize: 10, color: "#6b7280" },
              margin: [40, 20, 0, 0],
            },
            {
              text: formatDate(now),
              style: { fontSize: 10, color: "#6b7280" },
              alignment: "right",
              margin: [0, 20, 40, 0],
            },
          ],
        },
        footer: (currentPage: number, pageCount: number) => ({
          columns: [
            {
              text: "Generated by NetNynja NPM",
              style: "footer",
              margin: [40, 0, 0, 0],
            },
            {
              text: `Page ${currentPage} of ${pageCount}`,
              style: "footer",
              alignment: "right",
              margin: [0, 0, 40, 0],
            },
          ],
          margin: [0, 20, 0, 0],
        }),
        content: [
          { text: "NPM Health Report", style: "header" },
          {
            text: `Report generated on ${formatDate(now)}`,
            style: "subheader",
          },

          // Summary section
          { text: "Summary", style: "sectionHeader", margin: [0, 0, 0, 10] },
          {
            columns: [
              {
                width: "25%",
                stack: [
                  { text: "Total Devices", style: "summaryLabel" },
                  { text: summary.total_devices, style: "summaryValue" },
                ],
              },
              {
                width: "25%",
                stack: [
                  { text: "Devices Up", style: "summaryLabel" },
                  {
                    text: summary.devices_up,
                    style: "summaryValue",
                    color: "#10b981",
                  },
                ],
              },
              {
                width: "25%",
                stack: [
                  { text: "Devices Down", style: "summaryLabel" },
                  {
                    text: summary.devices_down,
                    style: "summaryValue",
                    color: "#ef4444",
                  },
                ],
              },
              {
                width: "25%",
                stack: [
                  { text: "Unknown", style: "summaryLabel" },
                  {
                    text: summary.devices_unknown,
                    style: "summaryValue",
                    color: "#6b7280",
                  },
                ],
              },
            ],
            margin: [0, 0, 0, 20],
          },

          // Device Status section
          {
            text: "Device Status",
            style: "sectionHeader",
            margin: [0, 0, 0, 10],
          },
          {
            table: {
              headerRows: 1,
              widths: query.includeMetrics
                ? ["18%", "14%", "14%", "10%", "11%", "11%", "11%", "11%"]
                : ["30%", "20%", "25%", "25%"],
              body: deviceTableBody,
            },
            layout: "lightHorizontalLines",
          },

          // Alerts section (conditional)
          ...alertsContent,
        ],
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      // Collect PDF chunks
      const chunks: Buffer[] = [];
      pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));

      return new Promise((resolve, reject) => {
        pdfDoc.on("end", () => {
          const pdfBuffer = Buffer.concat(chunks);
          reply.header("Content-Type", "application/pdf");
          reply.header(
            "Content-Disposition",
            `attachment; filename="npm-health-report-${now.toISOString().split("T")[0]}.pdf"`,
          );
          resolve(reply.send(pdfBuffer));
        });
        pdfDoc.on("error", reject);
        pdfDoc.end();
      });
    },
  );

  // Generate device-specific report
  fastify.get(
    "/devices/:id",
    {
      schema: {
        tags: ["NPM - Reports"],
        summary: "Export single device report",
        description: "Generate a PDF report for a specific device",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
          },
          required: ["id"],
        },
        querystring: {
          type: "object",
          properties: {
            format: { type: "string", enum: ["pdf"], default: "pdf" },
            timeRange: {
              type: "string",
              enum: ["1h", "6h", "24h", "7d", "30d"],
              default: "24h",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const now = new Date();

      // Get device details
      const deviceResult = await pool.query(
        `SELECT d.*, c.name as credential_name
         FROM npm.devices d
         LEFT JOIN npm.snmpv3_credentials c ON d.snmpv3_credential_id = c.id
         WHERE d.id = $1`,
        [id],
      );

      if (deviceResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Device not found" },
        };
      }

      const device = deviceResult.rows[0];

      // Get metrics for last 24h
      const metricsResult = await pool.query(
        `SELECT
          COUNT(*) as total_polls,
          COUNT(*) FILTER (WHERE is_available) as successful_polls,
          AVG(icmp_latency_ms) as avg_latency,
          MIN(icmp_latency_ms) as min_latency,
          MAX(icmp_latency_ms) as max_latency,
          AVG(cpu_utilization_percent) as avg_cpu,
          MAX(cpu_utilization_percent) as max_cpu,
          AVG(memory_utilization_percent) as avg_memory,
          MAX(memory_utilization_percent) as max_memory
        FROM npm.device_metrics
        WHERE device_id = $1
          AND collected_at >= NOW() - INTERVAL '24 hours'`,
        [id],
      );

      // Get interfaces
      const interfacesResult = await pool.query(
        `SELECT name, description, speed_mbps, admin_status, oper_status
         FROM npm.interfaces
         WHERE device_id = $1
         ORDER BY if_index`,
        [id],
      );

      // Get recent alerts
      const alertsResult = await pool.query(
        `SELECT severity, message, triggered_at, status
         FROM npm.alerts
         WHERE device_id = $1
         ORDER BY triggered_at DESC
         LIMIT 10`,
        [id],
      );

      const metrics = metricsResult.rows[0];
      const interfaces = interfacesResult.rows;
      const alerts = alertsResult.rows;

      // Calculate availability
      const totalPolls = parseInt(metrics.total_polls, 10) || 0;
      const successfulPolls = parseInt(metrics.successful_polls, 10) || 0;
      const availability =
        totalPolls > 0 ? (successfulPolls / totalPolls) * 100 : null;

      // Build interfaces table
      const interfacesTableBody: TableCell[][] = [
        [
          { text: "Name", style: "tableHeader" },
          { text: "Description", style: "tableHeader" },
          { text: "Speed", style: "tableHeader" },
          { text: "Admin", style: "tableHeader" },
          { text: "Oper", style: "tableHeader" },
        ],
      ];

      interfaces.forEach((iface) => {
        interfacesTableBody.push([
          { text: iface.name || "-", style: "tableCell" },
          { text: iface.description || "-", style: "tableCell" },
          {
            text: iface.speed_mbps ? `${iface.speed_mbps} Mbps` : "-",
            style: "tableCell",
          },
          { text: iface.admin_status || "-", style: "tableCell" },
          {
            text: iface.oper_status || "-",
            style: "tableCell",
            color: iface.oper_status === "up" ? "#10b981" : "#ef4444",
          },
        ]);
      });

      // Build alerts table
      const alertsTableBody: TableCell[][] = [
        [
          { text: "Severity", style: "tableHeader" },
          { text: "Message", style: "tableHeader" },
          { text: "Status", style: "tableHeader" },
          { text: "Time", style: "tableHeader" },
        ],
      ];

      alerts.forEach((alert) => {
        alertsTableBody.push([
          { text: alert.severity.toUpperCase(), style: "tableCell" },
          { text: alert.message, style: "tableCell" },
          { text: alert.status, style: "tableCell" },
          {
            text: formatDate(new Date(alert.triggered_at)),
            style: "tableCell",
          },
        ]);
      });

      const statusColor = (status: string): string => {
        switch (status) {
          case "up":
            return "#10b981";
          case "down":
            return "#ef4444";
          default:
            return "#6b7280";
        }
      };

      const docDefinition: TDocumentDefinitions = {
        pageSize: "LETTER",
        pageMargins: [40, 60, 40, 60],
        defaultStyle: {
          font: "Helvetica",
          fontSize: 10,
        },
        styles: {
          header: {
            fontSize: 20,
            bold: true,
            color: "#1f2937",
            margin: [0, 0, 0, 10],
          },
          subheader: {
            fontSize: 12,
            color: "#6b7280",
            margin: [0, 0, 0, 20],
          },
          sectionHeader: {
            fontSize: 14,
            bold: true,
            color: "#1f2937",
            margin: [0, 20, 0, 10],
          },
          infoLabel: {
            fontSize: 10,
            color: "#6b7280",
          },
          infoValue: {
            fontSize: 10,
            bold: true,
            color: "#1f2937",
          },
          tableHeader: {
            fontSize: 9,
            bold: true,
            color: "#374151",
            fillColor: "#f3f4f6",
            margin: [4, 6, 4, 6],
          },
          tableCell: {
            fontSize: 9,
            color: "#1f2937",
            margin: [4, 4, 4, 4],
          },
        },
        header: {
          columns: [
            {
              text: "NetNynja Enterprise",
              style: { fontSize: 10, color: "#6b7280" },
              margin: [40, 20, 0, 0],
            },
            {
              text: formatDate(now),
              style: { fontSize: 10, color: "#6b7280" },
              alignment: "right",
              margin: [0, 20, 40, 0],
            },
          ],
        },
        footer: (currentPage: number, pageCount: number) => ({
          columns: [
            {
              text: "Generated by NetNynja NPM",
              style: { fontSize: 8, color: "#9ca3af" },
              margin: [40, 0, 0, 0],
            },
            {
              text: `Page ${currentPage} of ${pageCount}`,
              style: { fontSize: 8, color: "#9ca3af" },
              alignment: "right",
              margin: [0, 0, 40, 0],
            },
          ],
          margin: [0, 20, 0, 0],
        }),
        content: [
          { text: `Device Report: ${device.name}`, style: "header" },
          {
            text: `Report generated on ${formatDate(now)}`,
            style: "subheader",
          },

          // Device Info section
          { text: "Device Information", style: "sectionHeader" },
          {
            columns: [
              {
                width: "50%",
                stack: [
                  {
                    columns: [
                      { text: "IP Address:", style: "infoLabel", width: 80 },
                      { text: device.ip_address, style: "infoValue" },
                    ],
                    margin: [0, 0, 0, 4],
                  },
                  {
                    columns: [
                      { text: "Type:", style: "infoLabel", width: 80 },
                      { text: device.device_type || "-", style: "infoValue" },
                    ],
                    margin: [0, 0, 0, 4],
                  },
                  {
                    columns: [
                      { text: "Vendor:", style: "infoLabel", width: 80 },
                      { text: device.vendor || "-", style: "infoValue" },
                    ],
                    margin: [0, 0, 0, 4],
                  },
                  {
                    columns: [
                      { text: "Model:", style: "infoLabel", width: 80 },
                      { text: device.model || "-", style: "infoValue" },
                    ],
                    margin: [0, 0, 0, 4],
                  },
                ],
              },
              {
                width: "50%",
                stack: [
                  {
                    columns: [
                      { text: "Status:", style: "infoLabel", width: 80 },
                      {
                        text: device.status.toUpperCase(),
                        style: "infoValue",
                        color: statusColor(device.status),
                      },
                    ],
                    margin: [0, 0, 0, 4],
                  },
                  {
                    columns: [
                      { text: "ICMP Polling:", style: "infoLabel", width: 80 },
                      {
                        text: device.poll_icmp ? "Enabled" : "Disabled",
                        style: "infoValue",
                      },
                    ],
                    margin: [0, 0, 0, 4],
                  },
                  {
                    columns: [
                      { text: "SNMP Polling:", style: "infoLabel", width: 80 },
                      {
                        text: device.poll_snmp ? "Enabled" : "Disabled",
                        style: "infoValue",
                      },
                    ],
                    margin: [0, 0, 0, 4],
                  },
                  {
                    columns: [
                      { text: "Poll Interval:", style: "infoLabel", width: 80 },
                      { text: `${device.poll_interval}s`, style: "infoValue" },
                    ],
                    margin: [0, 0, 0, 4],
                  },
                ],
              },
            ],
          },

          // Performance Metrics (24h)
          {
            text: "Performance Metrics (Last 24 Hours)",
            style: "sectionHeader",
          },
          {
            columns: [
              {
                width: "25%",
                stack: [
                  { text: "Availability", style: "infoLabel" },
                  {
                    text: availability ? `${availability.toFixed(2)}%` : "N/A",
                    style: "infoValue",
                    fontSize: 14,
                  },
                ],
              },
              {
                width: "25%",
                stack: [
                  { text: "Avg Latency", style: "infoLabel" },
                  {
                    text: metrics.avg_latency
                      ? `${parseFloat(metrics.avg_latency).toFixed(1)} ms`
                      : "N/A",
                    style: "infoValue",
                    fontSize: 14,
                  },
                ],
              },
              {
                width: "25%",
                stack: [
                  { text: "Avg CPU", style: "infoLabel" },
                  {
                    text: metrics.avg_cpu
                      ? `${parseFloat(metrics.avg_cpu).toFixed(1)}%`
                      : "N/A",
                    style: "infoValue",
                    fontSize: 14,
                  },
                ],
              },
              {
                width: "25%",
                stack: [
                  { text: "Avg Memory", style: "infoLabel" },
                  {
                    text: metrics.avg_memory
                      ? `${parseFloat(metrics.avg_memory).toFixed(1)}%`
                      : "N/A",
                    style: "infoValue",
                    fontSize: 14,
                  },
                ],
              },
            ],
            margin: [0, 0, 0, 10],
          },

          // Interfaces section (if any)
          ...(interfaces.length > 0
            ? [
                { text: "Interfaces", style: "sectionHeader" } as Content,
                {
                  table: {
                    headerRows: 1,
                    widths: ["25%", "30%", "15%", "15%", "15%"],
                    body: interfacesTableBody,
                  },
                  layout: "lightHorizontalLines",
                } as Content,
              ]
            : []),

          // Alerts section (if any)
          ...(alerts.length > 0
            ? [
                { text: "Recent Alerts", style: "sectionHeader" } as Content,
                {
                  table: {
                    headerRows: 1,
                    widths: ["15%", "40%", "15%", "30%"],
                    body: alertsTableBody,
                  },
                  layout: "lightHorizontalLines",
                } as Content,
              ]
            : []),
        ],
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      const chunks: Buffer[] = [];
      pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));

      return new Promise((resolve, reject) => {
        pdfDoc.on("end", () => {
          const pdfBuffer = Buffer.concat(chunks);
          reply.header("Content-Type", "application/pdf");
          reply.header(
            "Content-Disposition",
            `attachment; filename="device-report-${device.name.replace(/[^a-zA-Z0-9]/g, "-")}-${now.toISOString().split("T")[0]}.pdf"`,
          );
          resolve(reply.send(pdfBuffer));
        });
        pdfDoc.on("error", reject);
        pdfDoc.end();
      });
    },
  );
};

export default reportsRoutes;
