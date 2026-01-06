"""CKL (Checklist) export functionality for STIG audit results."""

import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Any

from defusedxml import ElementTree as SafeET

from ..core.logging import get_logger
from ..models import (
    AuditJob,
    AuditResult,
    Target,
    STIGDefinition,
    CheckStatus,
    CKLData,
    CKLTargetData,
    CKLVuln,
)

logger = get_logger(__name__)


# Map internal status to CKL status values
CKL_STATUS_MAP = {
    CheckStatus.PASS: "NotAFinding",
    CheckStatus.FAIL: "Open",
    CheckStatus.NOT_APPLICABLE: "Not_Applicable",
    CheckStatus.NOT_REVIEWED: "Not_Reviewed",
    CheckStatus.ERROR: "Not_Reviewed",
}


class CKLExporter:
    """Exporter for DISA STIG Viewer CKL format."""

    def __init__(self) -> None:
        """Initialize CKL exporter."""
        pass

    def export(
        self,
        job: AuditJob,
        target: Target,
        definition: STIGDefinition,
        results: list[AuditResult],
        output_path: Path,
    ) -> Path:
        """Export audit results to CKL format.

        Args:
            job: Audit job
            target: Target that was audited
            definition: STIG definition used
            results: Audit results
            output_path: Path to write CKL file

        Returns:
            Path to the generated CKL file
        """
        # Build CKL XML structure
        root = ET.Element("CHECKLIST")

        # Add asset information
        asset = ET.SubElement(root, "ASSET")
        self._add_asset_data(asset, target)

        # Add STIG info
        stigs = ET.SubElement(root, "STIGS")
        istig = ET.SubElement(stigs, "iSTIG")

        stig_info = ET.SubElement(istig, "STIG_INFO")
        self._add_stig_info(stig_info, definition)

        # Add vulnerability results
        for result in results:
            vuln = ET.SubElement(istig, "VULN")
            self._add_vuln_data(vuln, result, definition)

        # Write to file
        tree = ET.ElementTree(root)
        ET.indent(tree, space="  ")

        output_file = output_path / f"{job.id}.ckl"
        tree.write(output_file, encoding="utf-8", xml_declaration=True)

        logger.info("ckl_exported", job_id=job.id, path=str(output_file))
        return output_file

    def _add_asset_data(self, asset: ET.Element, target: Target) -> None:
        """Add asset (target) information to CKL."""
        elements = {
            "ROLE": "None",
            "ASSET_TYPE": "Computing",
            "HOST_NAME": target.name,
            "HOST_IP": target.ip_address,
            "HOST_MAC": "",
            "HOST_FQDN": "",
            "TECH_AREA": "",
            "TARGET_KEY": target.id,
            "WEB_OR_DATABASE": "false",
            "WEB_DB_SITE": "",
            "WEB_DB_INSTANCE": "",
        }

        for name, value in elements.items():
            elem = ET.SubElement(asset, name)
            elem.text = value

    def _add_stig_info(self, stig_info: ET.Element, definition: STIGDefinition) -> None:
        """Add STIG definition information to CKL."""
        si_data = [
            ("version", definition.version or ""),
            ("classification", "UNCLASSIFIED"),
            ("customname", ""),
            ("stigid", definition.stig_id),
            ("description", definition.description or ""),
            ("filename", f"{definition.stig_id}.xml"),
            ("releaseinfo", f"Release: {definition.release_date}" if definition.release_date else ""),
            ("title", definition.title),
            ("uuid", definition.id),
            ("notice", "terms-of-use"),
            ("source", "DISA"),
        ]

        for name, value in si_data:
            si = ET.SubElement(stig_info, "SI_DATA")
            sid_name = ET.SubElement(si, "SID_NAME")
            sid_name.text = name
            sid_data = ET.SubElement(si, "SID_DATA")
            sid_data.text = value

    def _add_vuln_data(
        self,
        vuln: ET.Element,
        result: AuditResult,
        definition: STIGDefinition,
    ) -> None:
        """Add vulnerability (check result) data to CKL."""
        # Get rule details from definition if available
        rule_data = self._get_rule_data(result.rule_id, definition)

        # Add STIG_DATA elements
        stig_data_items = [
            ("Vuln_Num", rule_data.get("vuln_id", result.rule_id)),
            ("Severity", result.severity.value if result.severity else "medium"),
            ("Group_Title", rule_data.get("group_title", "")),
            ("Rule_ID", result.rule_id),
            ("Rule_Ver", rule_data.get("version", "")),
            ("Rule_Title", result.title or ""),
            ("Vuln_Discuss", rule_data.get("description", "")),
            ("IA_Controls", ""),
            ("Check_Content", rule_data.get("check_content", "")),
            ("Fix_Text", rule_data.get("fix_content", "")),
            ("False_Positives", ""),
            ("False_Negatives", ""),
            ("Documentable", "false"),
            ("Mitigations", ""),
            ("Potential_Impact", ""),
            ("Third_Party_Tools", ""),
            ("Mitigation_Control", ""),
            ("Responsibility", ""),
            ("Security_Override_Guidance", ""),
            ("Check_Content_Ref", ""),
            ("Weight", "10.0"),
            ("Class", "Unclass"),
            ("STIGRef", definition.title),
            ("TargetKey", ""),
            ("STIG_UUID", definition.id),
            ("CCI_REF", ",".join(rule_data.get("ccis", []))),
        ]

        for name, value in stig_data_items:
            sd = ET.SubElement(vuln, "STIG_DATA")
            vuln_attr = ET.SubElement(sd, "VULN_ATTRIBUTE")
            vuln_attr.text = name
            attr_data = ET.SubElement(sd, "ATTRIBUTE_DATA")
            attr_data.text = str(value)

        # Add status
        status_elem = ET.SubElement(vuln, "STATUS")
        status_elem.text = CKL_STATUS_MAP.get(result.status, "Not_Reviewed")

        # Add finding details
        finding = ET.SubElement(vuln, "FINDING_DETAILS")
        finding.text = result.finding_details or ""

        # Add comments
        comments = ET.SubElement(vuln, "COMMENTS")
        comments.text = result.comments or ""

        # Add severity override (not used)
        sev_override = ET.SubElement(vuln, "SEVERITY_OVERRIDE")
        sev_override.text = ""

        sev_justification = ET.SubElement(vuln, "SEVERITY_JUSTIFICATION")
        sev_justification.text = ""

    def _get_rule_data(self, rule_id: str, definition: STIGDefinition) -> dict[str, Any]:
        """Get rule details from definition XCCDF content."""
        if not definition.xccdf_content or "rules" not in definition.xccdf_content:
            return {}

        for rule in definition.xccdf_content["rules"]:
            if rule.get("rule_id") == rule_id:
                return rule

        return {}

    def parse(self, ckl_path: Path) -> CKLData:
        """Parse an existing CKL file.

        Args:
            ckl_path: Path to CKL file

        Returns:
            Parsed CKL data
        """
        tree = SafeET.parse(str(ckl_path))
        root = tree.getroot()

        # Parse asset data
        asset = root.find("ASSET")
        target_data = CKLTargetData(
            hostname=self._get_text(asset, "HOST_NAME"),
            ip_address=self._get_text(asset, "HOST_IP"),
            mac_address=self._get_text(asset, "HOST_MAC") or None,
            fqdn=self._get_text(asset, "HOST_FQDN") or None,
            role=self._get_text(asset, "ROLE") or "None",
            asset_type=self._get_text(asset, "ASSET_TYPE") or "Computing",
        )

        # Parse STIG info
        stig_info = {}
        for si in root.findall(".//STIG_INFO/SI_DATA"):
            name = self._get_text(si, "SID_NAME")
            data = self._get_text(si, "SID_DATA")
            if name and data:
                stig_info[name] = data

        # Parse vulnerabilities
        vulns = []
        for vuln in root.findall(".//VULN"):
            vuln_data: dict[str, str] = {}
            for sd in vuln.findall("STIG_DATA"):
                attr = self._get_text(sd, "VULN_ATTRIBUTE")
                data = self._get_text(sd, "ATTRIBUTE_DATA")
                if attr:
                    vuln_data[attr] = data or ""

            status_text = self._get_text(vuln, "STATUS") or "Not_Reviewed"
            # Reverse map CKL status to internal status
            status = CheckStatus.NOT_REVIEWED
            for internal, ckl in CKL_STATUS_MAP.items():
                if ckl == status_text:
                    status = internal
                    break

            vulns.append(
                CKLVuln(
                    vuln_id=vuln_data.get("Vuln_Num", ""),
                    rule_id=vuln_data.get("Rule_ID", ""),
                    status=status,
                    finding_details=self._get_text(vuln, "FINDING_DETAILS"),
                    comments=self._get_text(vuln, "COMMENTS"),
                )
            )

        return CKLData(
            target_data=target_data,
            stig_info=stig_info,
            vulns=vulns,
        )

    def _get_text(self, parent: ET.Element | None, tag: str) -> str:
        """Get text content of a child element."""
        if parent is None:
            return ""
        elem = parent.find(tag)
        return elem.text if elem is not None and elem.text else ""
