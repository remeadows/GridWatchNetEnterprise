"""XCCDF Parser for extracting STIG metadata from DISA STIG XML files."""

import logging
import re
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass, field
from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Any, BinaryIO

from .catalog import PLATFORM_MAPPINGS, STIGEntry, STIGType
from ..models.target import Platform

logger = logging.getLogger(__name__)

# XCCDF namespace
XCCDF_NS = "http://checklists.nist.gov/xccdf/1.1"
DC_NS = "http://purl.org/dc/elements/1.1/"

NS = {
    "xccdf": XCCDF_NS,
    "dc": DC_NS,
}


@dataclass
class XCCDFRule:
    """Represents a single rule/check from XCCDF."""

    rule_id: str  # e.g., "SV-257777r991589_rule"
    vuln_id: str  # e.g., "V-257777"
    group_id: str  # e.g., "SRG-OS-000001-GPOS-00001"
    title: str
    description: str
    severity: str  # "high", "medium", "low"
    check_content: str
    fix_content: str
    ccis: list[str] = field(default_factory=list)
    legacy_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "rule_id": self.rule_id,
            "vuln_id": self.vuln_id,
            "group_id": self.group_id,
            "title": self.title,
            "description": self.description,
            "severity": self.severity,
            "check_content": self.check_content,
            "fix_content": self.fix_content,
            "ccis": self.ccis,
            "legacy_ids": self.legacy_ids,
        }


class XCCDFParser:
    """Parses XCCDF XML files to extract STIG metadata and rules."""

    def __init__(self):
        """Initialize parser."""
        self._current_file: str = ""

    def parse_zip(self, zip_path: Path | str) -> tuple[STIGEntry | None, list[XCCDFRule]]:
        """Parse a STIG ZIP file and extract metadata and rules.

        Args:
            zip_path: Path to STIG ZIP file

        Returns:
            Tuple of (STIGEntry metadata, list of rules)
        """
        zip_path = Path(zip_path)
        self._current_file = zip_path.name

        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                # Find XCCDF XML file within ZIP
                xccdf_file = self._find_xccdf_file(zf)
                if not xccdf_file:
                    logger.warning(f"No XCCDF file found in {zip_path.name}")
                    return None, []

                # Read and parse XML
                with zf.open(xccdf_file) as f:
                    content = f.read()
                    entry, rules = self._parse_xccdf_content(content)

                    if entry:
                        entry.zip_filename = zip_path.name
                        entry.xccdf_path = xccdf_file

                    return entry, rules

        except zipfile.BadZipFile:
            logger.error(f"Invalid ZIP file: {zip_path}")
            return None, []
        except Exception as e:
            logger.error(f"Error parsing {zip_path}: {e}")
            return None, []

    def parse_xml(self, xml_path: Path | str) -> tuple[STIGEntry | None, list[XCCDFRule]]:
        """Parse a standalone XCCDF XML file.

        Args:
            xml_path: Path to XCCDF XML file

        Returns:
            Tuple of (STIGEntry metadata, list of rules)
        """
        xml_path = Path(xml_path)
        self._current_file = xml_path.name

        try:
            with open(xml_path, "rb") as f:
                return self._parse_xccdf_content(f.read())
        except Exception as e:
            logger.error(f"Error parsing {xml_path}: {e}")
            return None, []

    def parse_bytes(
        self, content: bytes, filename: str = ""
    ) -> tuple[STIGEntry | None, list[XCCDFRule]]:
        """Parse XCCDF content from bytes.

        Args:
            content: XCCDF XML content as bytes
            filename: Optional filename for logging

        Returns:
            Tuple of (STIGEntry metadata, list of rules)
        """
        self._current_file = filename
        return self._parse_xccdf_content(content)

    def _find_xccdf_file(self, zf: zipfile.ZipFile) -> str | None:
        """Find XCCDF XML file within ZIP.

        Args:
            zf: Open zipfile

        Returns:
            Path to XCCDF file within ZIP or None
        """
        for name in zf.namelist():
            # Look for xccdf.xml files, excluding benchmark templates
            if name.lower().endswith("-xccdf.xml") or name.lower().endswith("_xccdf.xml"):
                return name
            if "xccdf" in name.lower() and name.endswith(".xml"):
                return name
        return None

    def _parse_xccdf_content(
        self, content: bytes
    ) -> tuple[STIGEntry | None, list[XCCDFRule]]:
        """Parse XCCDF XML content.

        Args:
            content: XML content as bytes

        Returns:
            Tuple of (STIGEntry metadata, list of rules)
        """
        try:
            root = ET.fromstring(content)
        except ET.ParseError as e:
            logger.error(f"XML parse error in {self._current_file}: {e}")
            return None, []

        # Extract benchmark metadata
        entry = self._extract_metadata(root)
        if not entry:
            return None, []

        # Extract rules
        rules = self._extract_rules(root)

        # Update entry with rule counts
        entry.rules_count = len(rules)
        entry.high_count = sum(1 for r in rules if r.severity == "high")
        entry.medium_count = sum(1 for r in rules if r.severity == "medium")
        entry.low_count = sum(1 for r in rules if r.severity == "low")

        # Collect all CCIs
        for rule in rules:
            entry.ccis.update(rule.ccis)

        # Determine platforms from benchmark ID and title
        entry.platforms = self._detect_platforms(entry.benchmark_id, entry.title)

        return entry, rules

    def _extract_metadata(self, root: ET.Element) -> STIGEntry | None:
        """Extract STIG metadata from Benchmark element.

        Args:
            root: Root Benchmark element

        Returns:
            STIGEntry or None
        """
        benchmark_id = root.get("id", "")
        if not benchmark_id:
            logger.warning(f"No benchmark ID found in {self._current_file}")
            return None

        # Title
        title_elem = root.find("xccdf:title", NS)
        title = title_elem.text if title_elem is not None and title_elem.text else ""

        # Version
        version_elem = root.find("xccdf:version", NS)
        version = version_elem.text if version_elem is not None and version_elem.text else "1"

        # Status
        status_elem = root.find("xccdf:status", NS)
        status = status_elem.text if status_elem is not None and status_elem.text else "accepted"
        status_date_str = status_elem.get("date") if status_elem is not None else None
        status_date = self._parse_date(status_date_str) if status_date_str else None

        # Release info (e.g., "Release: 6 Benchmark Date: 01 Oct 2025")
        release_elem = root.find('.//xccdf:plain-text[@id="release-info"]', NS)
        release_info = release_elem.text if release_elem is not None and release_elem.text else ""
        release, release_date = self._parse_release_info(release_info)

        # Description
        desc_elem = root.find("xccdf:description", NS)
        description = desc_elem.text if desc_elem is not None and desc_elem.text else ""

        # Profiles
        profiles = []
        for profile in root.findall("xccdf:Profile", NS):
            profile_id = profile.get("id")
            if profile_id:
                profiles.append(profile_id)

        # Determine type (STIG vs SRG)
        stig_type = STIGType.SRG if "_SRG" in benchmark_id or "SRG" in title else STIGType.STIG

        return STIGEntry(
            benchmark_id=benchmark_id,
            title=title,
            version=version,
            release=release,
            release_date=release_date,
            stig_type=stig_type,
            status=status,
            status_date=status_date,
            description=description[:500] if description else "",  # Truncate long descriptions
            profiles=profiles,
        )

    def _extract_rules(self, root: ET.Element) -> list[XCCDFRule]:
        """Extract rules from XCCDF.

        Args:
            root: Root Benchmark element

        Returns:
            List of XCCDF rules
        """
        rules = []

        for group in root.findall(".//xccdf:Group", NS):
            vuln_id = group.get("id", "")

            rule_elem = group.find("xccdf:Rule", NS)
            if rule_elem is None:
                continue

            rule_id = rule_elem.get("id", "")
            severity = rule_elem.get("severity", "medium")

            # Title
            title_elem = rule_elem.find("xccdf:title", NS)
            title = title_elem.text if title_elem is not None and title_elem.text else ""

            # Description (may contain XHTML)
            desc_elem = rule_elem.find("xccdf:description", NS)
            description = self._extract_text(desc_elem)

            # Group ID (SRG reference)
            group_id = ""
            for ident in rule_elem.findall("xccdf:ident", NS):
                ident_text = ident.text or ""
                if ident_text.startswith("SRG-"):
                    group_id = ident_text
                    break

            # Check content
            check_elem = rule_elem.find(".//xccdf:check-content", NS)
            check_content = self._extract_text(check_elem)

            # Fix content
            fix_elem = rule_elem.find("xccdf:fixtext", NS)
            fix_content = self._extract_text(fix_elem)

            # CCIs
            ccis = []
            for ident in rule_elem.findall("xccdf:ident", NS):
                ident_text = ident.text or ""
                if ident_text.startswith("CCI-"):
                    ccis.append(ident_text)

            # Legacy IDs
            legacy_ids = []
            for ident in rule_elem.findall("xccdf:ident", NS):
                ident_text = ident.text or ""
                if ident_text.startswith("SV-") or ident_text.startswith("V-"):
                    if ident_text != vuln_id:
                        legacy_ids.append(ident_text)

            rules.append(
                XCCDFRule(
                    rule_id=rule_id,
                    vuln_id=vuln_id,
                    group_id=group_id,
                    title=title,
                    description=description,
                    severity=severity,
                    check_content=check_content,
                    fix_content=fix_content,
                    ccis=ccis,
                    legacy_ids=legacy_ids,
                )
            )

        return rules

    def _extract_text(self, elem: ET.Element | None) -> str:
        """Extract text from element, handling nested XHTML.

        Args:
            elem: XML element

        Returns:
            Plain text content
        """
        if elem is None:
            return ""

        # Get all text including from child elements
        text_parts = []
        if elem.text:
            text_parts.append(elem.text)

        for child in elem:
            if child.text:
                text_parts.append(child.text)
            if child.tail:
                text_parts.append(child.tail)

        return " ".join(text_parts).strip()

    def _parse_release_info(self, release_info: str) -> tuple[int, date | None]:
        """Parse release info string.

        Args:
            release_info: e.g., "Release: 6 Benchmark Date: 01 Oct 2025"

        Returns:
            Tuple of (release number, benchmark date)
        """
        release = 1
        release_date = None

        if not release_info:
            return release, release_date

        # Extract release number
        release_match = re.search(r"Release:\s*(\d+)", release_info)
        if release_match:
            release = int(release_match.group(1))

        # Extract date (formats: "01 Oct 2025", "2025-10-01", etc.)
        date_patterns = [
            r"Benchmark Date:\s*(\d{1,2}\s+\w+\s+\d{4})",
            r"Date:\s*(\d{4}-\d{2}-\d{2})",
        ]

        for pattern in date_patterns:
            date_match = re.search(pattern, release_info)
            if date_match:
                release_date = self._parse_date(date_match.group(1))
                if release_date:
                    break

        return release, release_date

    def _parse_date(self, date_str: str) -> date | None:
        """Parse various date formats.

        Args:
            date_str: Date string

        Returns:
            Parsed date or None
        """
        if not date_str:
            return None

        # Try ISO format first
        try:
            return date.fromisoformat(date_str)
        except ValueError:
            pass

        # Try "01 Oct 2025" format
        months = {
            "jan": 1, "feb": 2, "mar": 3, "apr": 4,
            "may": 5, "jun": 6, "jul": 7, "aug": 8,
            "sep": 9, "oct": 10, "nov": 11, "dec": 12,
        }

        match = re.match(r"(\d{1,2})\s+(\w{3})\s+(\d{4})", date_str)
        if match:
            day = int(match.group(1))
            month_str = match.group(2).lower()
            year = int(match.group(3))

            if month_str in months:
                try:
                    return date(year, months[month_str], day)
                except ValueError:
                    pass

        return None

    def _detect_platforms(self, benchmark_id: str, title: str) -> list[Platform]:
        """Detect applicable platforms from benchmark ID and title.

        Args:
            benchmark_id: STIG benchmark ID
            title: STIG title

        Returns:
            List of applicable platforms
        """
        platforms: set[Platform] = set()
        search_text = f"{benchmark_id}_{title}".lower()

        for pattern, platform_list in PLATFORM_MAPPINGS.items():
            if pattern.lower() in search_text:
                platforms.update(platform_list)

        return list(platforms)


def parse_xccdf_file(path: Path | str) -> tuple[STIGEntry | None, list[XCCDFRule]]:
    """Convenience function to parse an XCCDF file.

    Args:
        path: Path to ZIP or XML file

    Returns:
        Tuple of (STIGEntry, list of rules)
    """
    path = Path(path)
    parser = XCCDFParser()

    if path.suffix.lower() == ".zip":
        return parser.parse_zip(path)
    elif path.suffix.lower() == ".xml":
        return parser.parse_xml(path)
    else:
        logger.warning(f"Unknown file type: {path}")
        return None, []
