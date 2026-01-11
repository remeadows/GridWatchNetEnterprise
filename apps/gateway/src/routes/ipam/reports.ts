/**
 * NetNynja Enterprise - IPAM Reports API Routes
 * PDF and CSV export functionality for IPAM scan reports
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { pool } from "../../db";
import type {
  TDocumentDefinitions,
  Content,
  TableCell,
} from "pdfmake/interfaces";

// Dynamic import for pdfmake to handle ESM/CJS compatibility
let printer: InstanceType<typeof import("pdfmake")> | null = null;

const initPrinter = async () => {
  if (!printer) {
    const PdfPrinter = (await import("pdfmake")).default;
    const fonts = {
      Helvetica: {
        normal: "Helvetica",
        bold: "Helvetica-Bold",
        italics: "Helvetica-Oblique",
        bolditalics: "Helvetica-BoldOblique",
      },
    };
    printer = new PdfPrinter(fonts);
  }
  return printer;
};

// Query schema for report parameters
const scanReportQuerySchema = z.object({
  format: z.enum(["pdf", "csv"]).default("pdf"),
  includeAddresses: z.coerce.boolean().default(true),
});

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

  // Export scan report (PDF/CSV)
  fastify.get(
    "/scans/:scanId/export",
    {
      schema: {
        tags: ["IPAM - Reports"],
        summary: "Export scan report",
        description: "Generate a PDF or CSV report of an IPAM scan",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            scanId: { type: "string", format: "uuid" },
          },
          required: ["scanId"],
        },
        querystring: {
          type: "object",
          properties: {
            format: { type: "string", enum: ["pdf", "csv"], default: "pdf" },
            includeAddresses: { type: "boolean", default: true },
          },
        },
      },
    },
    async (request, reply) => {
      const { scanId } = request.params as { scanId: string };
      const query = scanReportQuerySchema.parse(request.query);
      const now = new Date();

      // Get scan details
      const scanResult = await pool.query(
        `SELECT sh.*, n.name as network_name, n.network as network_cidr
         FROM ipam.scan_history sh
         JOIN ipam.networks n ON sh.network_id = n.id
         WHERE sh.id = $1`,
        [scanId],
      );

      if (scanResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Scan not found" },
        };
      }

      const scan = scanResult.rows[0];

      // Get discovered addresses from this scan (addresses with last_seen around scan time)
      let addresses: Array<{
        address: string;
        hostname: string | null;
        mac_address: string | null;
        vendor: string | null;
        status: string;
        last_seen: Date;
      }> = [];

      if (query.includeAddresses) {
        const addressesResult = await pool.query(
          `SELECT address, hostname, mac_address, vendor, status, last_seen
           FROM ipam.addresses
           WHERE network_id = $1
           ORDER BY inet(address)`,
          [scan.network_id],
        );
        addresses = addressesResult.rows;
      }

      // Generate CSV format
      if (query.format === "csv") {
        const lines: string[] = [];

        // Scan summary header
        lines.push("IPAM Scan Report");
        lines.push(`Network,${scan.network_name} (${scan.network_cidr})`);
        lines.push(`Scan Type,${scan.scan_type?.toUpperCase() || "PING"}`);
        lines.push(`Status,${scan.status}`);
        lines.push(
          `Started,${scan.started_at ? formatDate(new Date(scan.started_at)) : "N/A"}`,
        );
        lines.push(
          `Completed,${scan.completed_at ? formatDate(new Date(scan.completed_at)) : "N/A"}`,
        );
        lines.push(`Total IPs,${scan.total_ips ?? 0}`);
        lines.push(`Active IPs,${scan.active_ips ?? 0}`);
        lines.push(`New IPs,${scan.new_ips ?? 0}`);
        if (scan.name) {
          lines.push(`Name,${scan.name}`);
        }
        if (scan.notes) {
          lines.push(`Notes,"${scan.notes.replace(/"/g, '""')}"`);
        }
        lines.push("");

        // Address details
        if (query.includeAddresses && addresses.length > 0) {
          lines.push("IP Address,Hostname,MAC Address,Vendor,Status,Last Seen");
          addresses.forEach((addr) => {
            lines.push(
              [
                addr.address,
                addr.hostname || "",
                addr.mac_address || "",
                addr.vendor || "",
                addr.status,
                addr.last_seen ? formatDate(new Date(addr.last_seen)) : "",
              ]
                .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                .join(","),
            );
          });
        }

        const csv = lines.join("\n");

        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header(
          "Content-Disposition",
          `attachment; filename="ipam-scan-report-${scan.network_name.replace(/[^a-zA-Z0-9]/g, "-")}-${now.toISOString().split("T")[0]}.csv"`,
        );
        return csv;
      }

      // Generate PDF format
      const statusColor = (status: string): string => {
        switch (status) {
          case "completed":
          case "active":
            return "#10b981"; // green
          case "failed":
            return "#ef4444"; // red
          case "running":
          case "pending":
            return "#f59e0b"; // amber
          default:
            return "#6b7280"; // gray
        }
      };

      // Build address table if included
      const addressContent: Content[] = [];
      if (query.includeAddresses && addresses.length > 0) {
        const addressTableBody: TableCell[][] = [
          [
            { text: "IP Address", style: "tableHeader" },
            { text: "Hostname", style: "tableHeader" },
            { text: "MAC Address", style: "tableHeader" },
            { text: "Vendor", style: "tableHeader" },
            { text: "Status", style: "tableHeader" },
          ],
        ];

        addresses.forEach((addr) => {
          addressTableBody.push([
            { text: addr.address, style: "tableCell" },
            { text: addr.hostname || "-", style: "tableCell" },
            { text: addr.mac_address || "-", style: "tableCell" },
            { text: addr.vendor || "-", style: "tableCell" },
            {
              text: addr.status.charAt(0).toUpperCase() + addr.status.slice(1),
              style: "tableCell",
              color: statusColor(addr.status),
            },
          ]);
        });

        addressContent.push(
          {
            text: "Discovered Addresses",
            style: "sectionHeader",
            margin: [0, 20, 0, 10],
          },
          {
            table: {
              headerRows: 1,
              widths: ["20%", "25%", "20%", "20%", "15%"],
              body: addressTableBody,
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
          infoLabel: {
            fontSize: 10,
            color: "#6b7280",
          },
          infoValue: {
            fontSize: 10,
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
          notes: {
            fontSize: 10,
            color: "#4b5563",
            italics: true,
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
              text: "Generated by NetNynja IPAM",
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
          {
            text:
              scan.name ||
              `${scan.scan_type?.toUpperCase() || "PING"} Scan Report`,
            style: "header",
          },
          {
            text: `Network: ${scan.network_name} (${scan.network_cidr})`,
            style: "subheader",
          },

          // Scan Details section
          {
            text: "Scan Details",
            style: "sectionHeader",
            margin: [0, 0, 0, 10],
          },
          {
            columns: [
              {
                width: "50%",
                stack: [
                  {
                    columns: [
                      { text: "Scan Type:", style: "infoLabel", width: 80 },
                      {
                        text: scan.scan_type?.toUpperCase() || "PING",
                        style: "infoValue",
                      },
                    ],
                    margin: [0, 0, 0, 4],
                  },
                  {
                    columns: [
                      { text: "Status:", style: "infoLabel", width: 80 },
                      {
                        text:
                          scan.status.charAt(0).toUpperCase() +
                          scan.status.slice(1),
                        style: "infoValue",
                        color: statusColor(scan.status),
                      },
                    ],
                    margin: [0, 0, 0, 4],
                  },
                  {
                    columns: [
                      { text: "Started:", style: "infoLabel", width: 80 },
                      {
                        text: scan.started_at
                          ? formatDate(new Date(scan.started_at))
                          : "N/A",
                        style: "infoValue",
                      },
                    ],
                    margin: [0, 0, 0, 4],
                  },
                  {
                    columns: [
                      { text: "Completed:", style: "infoLabel", width: 80 },
                      {
                        text: scan.completed_at
                          ? formatDate(new Date(scan.completed_at))
                          : "N/A",
                        style: "infoValue",
                      },
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
                      { text: "Network:", style: "infoLabel", width: 80 },
                      { text: scan.network_cidr, style: "infoValue" },
                    ],
                    margin: [0, 0, 0, 4],
                  },
                ],
              },
            ],
            margin: [0, 0, 0, 20],
          },

          // Results Summary section
          {
            text: "Results Summary",
            style: "sectionHeader",
            margin: [0, 0, 0, 10],
          },
          {
            columns: [
              {
                width: "33%",
                stack: [
                  { text: "Total IPs Scanned", style: "summaryLabel" },
                  { text: String(scan.total_ips ?? 0), style: "summaryValue" },
                ],
              },
              {
                width: "33%",
                stack: [
                  { text: "Active IPs Found", style: "summaryLabel" },
                  {
                    text: String(scan.active_ips ?? 0),
                    style: "summaryValue",
                    color: "#10b981",
                  },
                ],
              },
              {
                width: "33%",
                stack: [
                  { text: "New IPs Discovered", style: "summaryLabel" },
                  {
                    text: String(scan.new_ips ?? 0),
                    style: "summaryValue",
                    color: "#3b82f6",
                  },
                ],
              },
            ],
            margin: [0, 0, 0, 10],
          },

          // Notes section (if any)
          ...(scan.notes
            ? [
                {
                  text: "Notes",
                  style: "sectionHeader",
                  margin: [0, 20, 0, 5],
                } as Content,
                { text: scan.notes, style: "notes" } as Content,
              ]
            : []),

          // Addresses section
          ...addressContent,
        ],
      };

      const pdfPrinter = await initPrinter();
      const pdfDoc = pdfPrinter.createPdfKitDocument(docDefinition);

      // Collect PDF chunks
      const chunks: Buffer[] = [];
      pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));

      return new Promise((resolve, reject) => {
        pdfDoc.on("end", () => {
          const buffer = Buffer.concat(chunks);
          reply.header("Content-Type", "application/pdf");
          reply.header(
            "Content-Disposition",
            `attachment; filename="ipam-scan-report-${scan.network_name.replace(/[^a-zA-Z0-9]/g, "-")}-${now.toISOString().split("T")[0]}.pdf"`,
          );
          resolve(reply.send(buffer));
        });
        pdfDoc.on("error", (err: Error) => reject(err));
        pdfDoc.end();
      });
    },
  );

  // Export network addresses report (PDF/CSV)
  fastify.get(
    "/networks/:id/export",
    {
      schema: {
        tags: ["IPAM - Reports"],
        summary: "Export network addresses report",
        description:
          "Generate a PDF or CSV report of all addresses in a network",
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
            format: { type: "string", enum: ["pdf", "csv"], default: "pdf" },
            status: {
              type: "string",
              enum: ["all", "active", "inactive", "reserved"],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = request.query as {
        format?: "pdf" | "csv";
        status?: string;
      };
      const format = query.format || "pdf";
      const now = new Date();

      // Get network details
      const networkResult = await pool.query(
        "SELECT * FROM ipam.networks WHERE id = $1",
        [id],
      );

      if (networkResult.rows.length === 0) {
        reply.status(404);
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Network not found" },
        };
      }

      const network = networkResult.rows[0];

      // Get addresses with optional status filter
      let addressQuery = `
        SELECT address, hostname, mac_address, vendor, status, last_seen, description
        FROM ipam.addresses
        WHERE network_id = $1
      `;
      const params: unknown[] = [id];

      if (query.status && query.status !== "all") {
        params.push(query.status);
        addressQuery += ` AND status = $${params.length}`;
      }

      addressQuery += " ORDER BY inet(address)";

      const addressesResult = await pool.query(addressQuery, params);
      const addresses = addressesResult.rows;

      // Calculate stats
      const activeCount = addresses.filter((a) => a.status === "active").length;
      const reservedCount = addresses.filter(
        (a) => a.status === "reserved",
      ).length;
      const inactiveCount = addresses.filter(
        (a) => a.status === "inactive",
      ).length;

      // Generate CSV format
      if (format === "csv") {
        const lines: string[] = [];

        // Network summary header
        lines.push("IPAM Network Report");
        lines.push(`Network,${network.name}`);
        lines.push(`CIDR,${network.network}`);
        lines.push(`Gateway,${network.gateway || "N/A"}`);
        lines.push(`VLAN,${network.vlan_id || "N/A"}`);
        lines.push(`Site,${network.site || "N/A"}`);
        lines.push(`Total Addresses,${addresses.length}`);
        lines.push(`Active,${activeCount}`);
        lines.push(`Reserved,${reservedCount}`);
        lines.push(`Inactive,${inactiveCount}`);
        lines.push("");

        // Address details
        lines.push(
          "IP Address,Hostname,MAC Address,Vendor,Status,Last Seen,Description",
        );
        addresses.forEach((addr) => {
          lines.push(
            [
              addr.address,
              addr.hostname || "",
              addr.mac_address || "",
              addr.vendor || "",
              addr.status,
              addr.last_seen ? formatDate(new Date(addr.last_seen)) : "",
              addr.description || "",
            ]
              .map((v) => `"${String(v).replace(/"/g, '""')}"`)
              .join(","),
          );
        });

        const csv = lines.join("\n");

        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header(
          "Content-Disposition",
          `attachment; filename="ipam-network-${network.name.replace(/[^a-zA-Z0-9]/g, "-")}-${now.toISOString().split("T")[0]}.csv"`,
        );
        return csv;
      }

      // Generate PDF format
      const statusColor = (status: string): string => {
        switch (status) {
          case "active":
            return "#10b981";
          case "reserved":
            return "#f59e0b";
          case "dhcp":
            return "#3b82f6";
          default:
            return "#6b7280";
        }
      };

      // Build address table
      const addressTableBody: TableCell[][] = [
        [
          { text: "IP Address", style: "tableHeader" },
          { text: "Hostname", style: "tableHeader" },
          { text: "MAC Address", style: "tableHeader" },
          { text: "Vendor", style: "tableHeader" },
          { text: "Status", style: "tableHeader" },
          { text: "Last Seen", style: "tableHeader" },
        ],
      ];

      addresses.forEach((addr) => {
        addressTableBody.push([
          { text: addr.address, style: "tableCell" },
          { text: addr.hostname || "-", style: "tableCell" },
          { text: addr.mac_address || "-", style: "tableCell" },
          { text: addr.vendor || "-", style: "tableCell" },
          {
            text: addr.status.charAt(0).toUpperCase() + addr.status.slice(1),
            style: "tableCell",
            color: statusColor(addr.status),
          },
          {
            text: addr.last_seen ? formatDate(new Date(addr.last_seen)) : "-",
            style: "tableCell",
          },
        ]);
      });

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
          infoLabel: {
            fontSize: 10,
            color: "#6b7280",
          },
          infoValue: {
            fontSize: 10,
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
              text: "Generated by NetNynja IPAM",
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
          { text: `Network Report: ${network.name}`, style: "header" },
          { text: `CIDR: ${network.network}`, style: "subheader" },

          // Network Details section
          {
            text: "Network Details",
            style: "sectionHeader",
            margin: [0, 0, 0, 10],
          },
          {
            columns: [
              {
                width: "50%",
                stack: [
                  {
                    columns: [
                      { text: "Gateway:", style: "infoLabel", width: 80 },
                      { text: network.gateway || "N/A", style: "infoValue" },
                    ],
                    margin: [0, 0, 0, 4],
                  },
                  {
                    columns: [
                      { text: "VLAN ID:", style: "infoLabel", width: 80 },
                      {
                        text: network.vlan_id ? String(network.vlan_id) : "N/A",
                        style: "infoValue",
                      },
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
                      { text: "Site:", style: "infoLabel", width: 80 },
                      { text: network.site || "N/A", style: "infoValue" },
                    ],
                    margin: [0, 0, 0, 4],
                  },
                  {
                    columns: [
                      { text: "Location:", style: "infoLabel", width: 80 },
                      { text: network.location || "N/A", style: "infoValue" },
                    ],
                    margin: [0, 0, 0, 4],
                  },
                ],
              },
            ],
            margin: [0, 0, 0, 20],
          },

          // Address Summary section
          {
            text: "Address Summary",
            style: "sectionHeader",
            margin: [0, 0, 0, 10],
          },
          {
            columns: [
              {
                width: "25%",
                stack: [
                  { text: "Total", style: "summaryLabel" },
                  { text: String(addresses.length), style: "summaryValue" },
                ],
              },
              {
                width: "25%",
                stack: [
                  { text: "Active", style: "summaryLabel" },
                  {
                    text: String(activeCount),
                    style: "summaryValue",
                    color: "#10b981",
                  },
                ],
              },
              {
                width: "25%",
                stack: [
                  { text: "Reserved", style: "summaryLabel" },
                  {
                    text: String(reservedCount),
                    style: "summaryValue",
                    color: "#f59e0b",
                  },
                ],
              },
              {
                width: "25%",
                stack: [
                  { text: "Inactive", style: "summaryLabel" },
                  {
                    text: String(inactiveCount),
                    style: "summaryValue",
                    color: "#6b7280",
                  },
                ],
              },
            ],
            margin: [0, 0, 0, 20],
          },

          // Addresses section
          {
            text: "IP Addresses",
            style: "sectionHeader",
            margin: [0, 0, 0, 10],
          },
          {
            table: {
              headerRows: 1,
              widths: ["15%", "20%", "18%", "17%", "12%", "18%"],
              body: addressTableBody,
            },
            layout: "lightHorizontalLines",
          },
        ],
      };

      const pdfPrinter = await initPrinter();
      const pdfDoc = pdfPrinter.createPdfKitDocument(docDefinition);

      const chunks: Buffer[] = [];
      pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));

      return new Promise((resolve, reject) => {
        pdfDoc.on("end", () => {
          const buffer = Buffer.concat(chunks);
          reply.header("Content-Type", "application/pdf");
          reply.header(
            "Content-Disposition",
            `attachment; filename="ipam-network-${network.name.replace(/[^a-zA-Z0-9]/g, "-")}-${now.toISOString().split("T")[0]}.pdf"`,
          );
          resolve(reply.send(buffer));
        });
        pdfDoc.on("error", (err: Error) => reject(err));
        pdfDoc.end();
      });
    },
  );
};

export default reportsRoutes;
