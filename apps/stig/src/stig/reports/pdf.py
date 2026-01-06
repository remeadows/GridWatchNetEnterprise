"""PDF report generation for STIG audit results."""

from datetime import datetime
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
)

from ..core.config import settings
from ..core.logging import get_logger
from ..models import (
    AuditJob,
    AuditResult,
    Target,
    STIGDefinition,
    ComplianceSummary,
    CheckStatus,
)

logger = get_logger(__name__)


# Color scheme
COLORS = {
    "header": colors.HexColor("#1f2937"),
    "pass": colors.HexColor("#059669"),
    "fail": colors.HexColor("#dc2626"),
    "na": colors.HexColor("#6b7280"),
    "warning": colors.HexColor("#d97706"),
    "high": colors.HexColor("#dc2626"),
    "medium": colors.HexColor("#d97706"),
    "low": colors.HexColor("#2563eb"),
}


class PDFExporter:
    """PDF report generator for STIG audits."""

    def __init__(self) -> None:
        """Initialize PDF exporter."""
        self.styles = getSampleStyleSheet()
        self._add_custom_styles()

    def _add_custom_styles(self) -> None:
        """Add custom paragraph styles."""
        self.styles.add(
            ParagraphStyle(
                "Title2",
                parent=self.styles["Heading1"],
                fontSize=24,
                spaceAfter=30,
                textColor=COLORS["header"],
            )
        )
        self.styles.add(
            ParagraphStyle(
                "Section",
                parent=self.styles["Heading2"],
                fontSize=14,
                spaceBefore=20,
                spaceAfter=10,
                textColor=COLORS["header"],
            )
        )
        self.styles.add(
            ParagraphStyle(
                "FindingHigh",
                parent=self.styles["Normal"],
                textColor=COLORS["high"],
                fontName="Helvetica-Bold",
            )
        )
        self.styles.add(
            ParagraphStyle(
                "FindingMedium",
                parent=self.styles["Normal"],
                textColor=COLORS["medium"],
                fontName="Helvetica-Bold",
            )
        )
        self.styles.add(
            ParagraphStyle(
                "FindingLow",
                parent=self.styles["Normal"],
                textColor=COLORS["low"],
                fontName="Helvetica-Bold",
            )
        )

    def export(
        self,
        job: AuditJob,
        target: Target,
        definition: STIGDefinition,
        results: list[AuditResult],
        summary: ComplianceSummary,
        output_path: Path,
        include_details: bool = True,
        include_remediation: bool = True,
    ) -> Path:
        """Export audit results to PDF format.

        Args:
            job: Audit job
            target: Target that was audited
            definition: STIG definition used
            results: Audit results
            summary: Compliance summary
            output_path: Path to write PDF file
            include_details: Include finding details
            include_remediation: Include remediation guidance

        Returns:
            Path to the generated PDF file
        """
        output_file = output_path / f"{job.id}.pdf"

        doc = SimpleDocTemplate(
            str(output_file),
            pagesize=letter,
            rightMargin=0.75 * inch,
            leftMargin=0.75 * inch,
            topMargin=0.75 * inch,
            bottomMargin=0.75 * inch,
        )

        story = []

        # Title
        story.append(Paragraph("STIG Compliance Report", self.styles["Title2"]))
        story.append(Spacer(1, 12))

        # Report metadata
        story.extend(self._build_metadata_section(job, target, definition))
        story.append(Spacer(1, 20))

        # Executive summary
        story.extend(self._build_summary_section(summary))
        story.append(PageBreak())

        # Findings by severity
        story.extend(self._build_findings_section(results, include_details, include_remediation))

        # Build PDF
        doc.build(story)

        logger.info("pdf_exported", job_id=job.id, path=str(output_file))
        return output_file

    def _build_metadata_section(
        self,
        job: AuditJob,
        target: Target,
        definition: STIGDefinition,
    ) -> list:
        """Build report metadata section."""
        elements = []

        data = [
            ["Report Date:", datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")],
            ["Target:", f"{target.name} ({target.ip_address})"],
            ["Platform:", target.platform.value],
            ["STIG:", definition.title],
            ["STIG ID:", definition.stig_id],
            ["Version:", definition.version or "N/A"],
            ["Audit ID:", job.id],
        ]

        table = Table(data, colWidths=[1.5 * inch, 5 * inch])
        table.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )

        elements.append(table)
        return elements

    def _build_summary_section(self, summary: ComplianceSummary) -> list:
        """Build executive summary section."""
        elements = []

        elements.append(Paragraph("Executive Summary", self.styles["Section"]))

        # Compliance score
        score_color = (
            COLORS["pass"] if summary.compliance_score >= 80
            else COLORS["warning"] if summary.compliance_score >= 60
            else COLORS["fail"]
        )

        elements.append(
            Paragraph(
                f"Overall Compliance Score: <b>{summary.compliance_score:.1f}%</b>",
                self.styles["Normal"],
            )
        )
        elements.append(Spacer(1, 12))

        # Summary table
        data = [
            ["Category", "Count", "Percentage"],
            ["Passed", str(summary.passed), f"{summary.passed / summary.total_checks * 100:.1f}%"],
            ["Failed", str(summary.failed), f"{summary.failed / summary.total_checks * 100:.1f}%"],
            ["Not Applicable", str(summary.not_applicable), f"{summary.not_applicable / summary.total_checks * 100:.1f}%"],
            ["Not Reviewed", str(summary.not_reviewed), f"{summary.not_reviewed / summary.total_checks * 100:.1f}%"],
            ["Errors", str(summary.errors), f"{summary.errors / summary.total_checks * 100:.1f}%"],
            ["Total Checks", str(summary.total_checks), "100%"],
        ]

        table = Table(data, colWidths=[2.5 * inch, 1.5 * inch, 1.5 * inch])
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), COLORS["header"]),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    # Color rows by status
                    ("TEXTCOLOR", (0, 1), (-1, 1), COLORS["pass"]),
                    ("TEXTCOLOR", (0, 2), (-1, 2), COLORS["fail"]),
                ]
            )
        )

        elements.append(table)
        elements.append(Spacer(1, 20))

        # Severity breakdown
        elements.append(Paragraph("Findings by Severity", self.styles["Section"]))

        sev_data = [
            ["Severity", "Passed", "Failed"],
            [
                "High",
                str(summary.severity_breakdown.get("high", {}).get("passed", 0)),
                str(summary.severity_breakdown.get("high", {}).get("failed", 0)),
            ],
            [
                "Medium",
                str(summary.severity_breakdown.get("medium", {}).get("passed", 0)),
                str(summary.severity_breakdown.get("medium", {}).get("failed", 0)),
            ],
            [
                "Low",
                str(summary.severity_breakdown.get("low", {}).get("passed", 0)),
                str(summary.severity_breakdown.get("low", {}).get("failed", 0)),
            ],
        ]

        sev_table = Table(sev_data, colWidths=[2 * inch, 1.5 * inch, 1.5 * inch])
        sev_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), COLORS["header"]),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("TEXTCOLOR", (0, 1), (0, 1), COLORS["high"]),
                    ("TEXTCOLOR", (0, 2), (0, 2), COLORS["medium"]),
                    ("TEXTCOLOR", (0, 3), (0, 3), COLORS["low"]),
                ]
            )
        )

        elements.append(sev_table)

        return elements

    def _build_findings_section(
        self,
        results: list[AuditResult],
        include_details: bool,
        include_remediation: bool,
    ) -> list:
        """Build detailed findings section."""
        elements = []

        # Group results by severity and status
        failed_results = [r for r in results if r.status == CheckStatus.FAIL]

        # Sort by severity
        severity_order = {"high": 0, "medium": 1, "low": 2}
        failed_results.sort(
            key=lambda r: severity_order.get(r.severity.value if r.severity else "medium", 3)
        )

        if not failed_results:
            elements.append(Paragraph("Detailed Findings", self.styles["Section"]))
            elements.append(Paragraph("No failed checks found.", self.styles["Normal"]))
            return elements

        elements.append(Paragraph("Failed Findings", self.styles["Section"]))
        elements.append(
            Paragraph(
                f"The following {len(failed_results)} checks failed and require attention:",
                self.styles["Normal"],
            )
        )
        elements.append(Spacer(1, 12))

        for result in failed_results:
            severity = result.severity.value if result.severity else "medium"
            style_name = f"Finding{severity.capitalize()}"

            elements.append(
                Paragraph(
                    f"[{severity.upper()}] {result.rule_id}: {result.title or 'No title'}",
                    self.styles.get(style_name, self.styles["Normal"]),
                )
            )

            if include_details and result.finding_details:
                elements.append(Spacer(1, 4))
                elements.append(
                    Paragraph(
                        f"<b>Finding:</b> {result.finding_details}",
                        self.styles["Normal"],
                    )
                )

            elements.append(Spacer(1, 12))

        return elements
