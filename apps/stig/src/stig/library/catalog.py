"""STIG Catalog data models for managing STIG Library entries."""

from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from pathlib import Path
from typing import Any

from ..models.target import Platform


class STIGType(str, Enum):
    """Type of STIG document."""

    STIG = "stig"  # Security Technical Implementation Guide
    SRG = "srg"  # Security Requirements Guide


@dataclass
class STIGEntry:
    """Represents a single STIG definition in the library.

    Extracted from XCCDF XML files within STIG ZIP archives.
    """

    # Core identifiers
    benchmark_id: str  # e.g., "RHEL_9_STIG"
    title: str  # e.g., "Red Hat Enterprise Linux 9 Security Technical Implementation Guide"

    # Version info
    version: str  # e.g., "2"
    release: int  # e.g., 6 (from "Release: 6")
    release_date: date | None = None  # Benchmark date from release-info

    # File info
    zip_filename: str = ""  # Original ZIP file name
    xccdf_path: str = ""  # Path to XCCDF XML within ZIP

    # Metadata
    stig_type: STIGType = STIGType.STIG
    status: str = "accepted"
    status_date: date | None = None
    description: str = ""

    # Rule counts
    rules_count: int = 0
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0

    # Platform mapping
    platforms: list[Platform] = field(default_factory=list)

    # Profiles available (MAC levels)
    profiles: list[str] = field(default_factory=list)

    # CCIs covered
    ccis: set[str] = field(default_factory=set)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "benchmark_id": self.benchmark_id,
            "title": self.title,
            "version": self.version,
            "release": self.release,
            "release_date": self.release_date.isoformat() if self.release_date else None,
            "zip_filename": self.zip_filename,
            "xccdf_path": self.xccdf_path,
            "stig_type": self.stig_type.value,
            "status": self.status,
            "status_date": self.status_date.isoformat() if self.status_date else None,
            "description": self.description,
            "rules_count": self.rules_count,
            "high_count": self.high_count,
            "medium_count": self.medium_count,
            "low_count": self.low_count,
            "platforms": [p.value for p in self.platforms],
            "profiles": self.profiles,
            "ccis": list(self.ccis),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "STIGEntry":
        """Create instance from dictionary."""
        return cls(
            benchmark_id=data["benchmark_id"],
            title=data["title"],
            version=data["version"],
            release=data["release"],
            release_date=date.fromisoformat(data["release_date"]) if data.get("release_date") else None,
            zip_filename=data.get("zip_filename", ""),
            xccdf_path=data.get("xccdf_path", ""),
            stig_type=STIGType(data.get("stig_type", "stig")),
            status=data.get("status", "accepted"),
            status_date=date.fromisoformat(data["status_date"]) if data.get("status_date") else None,
            description=data.get("description", ""),
            rules_count=data.get("rules_count", 0),
            high_count=data.get("high_count", 0),
            medium_count=data.get("medium_count", 0),
            low_count=data.get("low_count", 0),
            platforms=[Platform(p) for p in data.get("platforms", [])],
            profiles=data.get("profiles", []),
            ccis=set(data.get("ccis", [])),
        )


# Platform name patterns to Platform enum mapping
# Maps keywords found in STIG titles/IDs to Platform enum values
PLATFORM_MAPPINGS: dict[str, list[Platform]] = {
    # Linux distributions
    "rhel_9": [Platform.REDHAT],
    "rhel_8": [Platform.REDHAT],
    "rhel_7": [Platform.REDHAT],
    "red_hat": [Platform.REDHAT],
    "ubuntu": [Platform.LINUX],
    "oracle_linux": [Platform.LINUX],
    "suse": [Platform.LINUX],
    "amazon_linux": [Platform.LINUX],
    "almalinux": [Platform.LINUX, Platform.REDHAT],
    "anduril_nixos": [Platform.LINUX],
    # macOS
    "macos": [Platform.MACOS],
    "apple_macos": [Platform.MACOS],
    # Windows
    "windows": [Platform.WINDOWS],
    "win_": [Platform.WINDOWS],
    "microsoft": [Platform.WINDOWS],
    # Cisco
    "cisco_ios": [Platform.CISCO_IOS],
    "cisco_ios-xe": [Platform.CISCO_IOS],
    "cisco_ios-xr": [Platform.CISCO_IOS],
    "cisco_nx-os": [Platform.CISCO_NXOS],
    "cisco_nxos": [Platform.CISCO_NXOS],
    "cisco_asa": [Platform.CISCO_IOS],  # Similar platform
    "cisco_ise": [Platform.CISCO_IOS],
    "cisco_aci": [Platform.CISCO_NXOS],
    # Arista
    "arista": [Platform.ARISTA_EOS],
    "arista_mls": [Platform.ARISTA_EOS],
    "arista_eos": [Platform.ARISTA_EOS],
    # HPE/Aruba
    "hpe_aruba": [Platform.HPE_ARUBA_CX],
    "aruba_networking": [Platform.HPE_ARUBA_CX],
    "hp_flexfabric": [Platform.HP_PROCURVE],
    # Juniper
    "juniper": [Platform.JUNIPER_JUNOS],
    "juniper_router": [Platform.JUNIPER_JUNOS],
    "juniper_srx": [Platform.JUNIPER_SRX],
    "juniper_ex": [Platform.JUNIPER_JUNOS],
    # Palo Alto
    "paloalto": [Platform.PALOALTO],
    "palo_alto": [Platform.PALOALTO],
    # Fortinet
    "fortigate": [Platform.FORTINET],
    "fortinet": [Platform.FORTINET],
    # F5
    "f5_big-ip": [Platform.F5_BIGIP],
    "f5_tmos": [Platform.F5_BIGIP],
    "big-ip": [Platform.F5_BIGIP],
    # VMware
    "vmware_esxi": [Platform.VMWARE_ESXI],
    "vmware_vcenter": [Platform.VMWARE_VCENTER],
    "vmware_vsphere": [Platform.VMWARE_ESXI, Platform.VMWARE_VCENTER],
    # Mellanox
    "mellanox": [Platform.MELLANOX],
    # Dell
    "dell_os10": [Platform.ARISTA_EOS],  # Similar CLI style
    # pfSense - uses GPOS SRG
    "pfsense": [Platform.PFSENSE],
}


@dataclass
class PlatformMapping:
    """Maps a STIG to its applicable platforms."""

    stig_id: str
    platforms: list[Platform]
    is_generic: bool = False  # True for SRGs that apply broadly

    @classmethod
    def from_stig_entry(cls, entry: STIGEntry) -> "PlatformMapping":
        """Create mapping from STIG entry."""
        return cls(
            stig_id=entry.benchmark_id,
            platforms=entry.platforms,
            is_generic=entry.stig_type == STIGType.SRG,
        )


class STIGCatalog:
    """Manages the collection of STIG definitions in the library.

    Provides lookup, filtering, and platform-based selection.
    """

    def __init__(self, library_path: Path | str | None = None):
        """Initialize catalog.

        Args:
            library_path: Path to STIG library folder containing ZIP files
        """
        self._entries: dict[str, STIGEntry] = {}
        self._platform_index: dict[Platform, list[str]] = {p: [] for p in Platform}
        self.library_path = Path(library_path) if library_path else None

    @property
    def entries(self) -> list[STIGEntry]:
        """Get all catalog entries."""
        return list(self._entries.values())

    def add_entry(self, entry: STIGEntry) -> None:
        """Add a STIG entry to the catalog.

        Args:
            entry: STIG entry to add
        """
        self._entries[entry.benchmark_id] = entry

        # Index by platform
        for platform in entry.platforms:
            if entry.benchmark_id not in self._platform_index[platform]:
                self._platform_index[platform].append(entry.benchmark_id)

    def get_entry(self, benchmark_id: str) -> STIGEntry | None:
        """Get entry by benchmark ID.

        Args:
            benchmark_id: STIG benchmark ID

        Returns:
            STIG entry or None if not found
        """
        return self._entries.get(benchmark_id)

    def get_by_platform(self, platform: Platform) -> list[STIGEntry]:
        """Get all STIGs applicable to a platform.

        Args:
            platform: Target platform

        Returns:
            List of applicable STIG entries
        """
        stig_ids = self._platform_index.get(platform, [])
        return [self._entries[sid] for sid in stig_ids if sid in self._entries]

    def search(
        self,
        query: str = "",
        platform: Platform | None = None,
        stig_type: STIGType | None = None,
    ) -> list[STIGEntry]:
        """Search catalog entries.

        Args:
            query: Text to search in title/description
            platform: Filter by platform
            stig_type: Filter by STIG vs SRG

        Returns:
            List of matching entries
        """
        results = list(self._entries.values())

        if query:
            query_lower = query.lower()
            results = [
                e
                for e in results
                if query_lower in e.title.lower()
                or query_lower in e.benchmark_id.lower()
                or query_lower in e.description.lower()
            ]

        if platform:
            results = [e for e in results if platform in e.platforms]

        if stig_type:
            results = [e for e in results if e.stig_type == stig_type]

        return results

    def get_latest_for_platform(self, platform: Platform) -> STIGEntry | None:
        """Get the most recent STIG for a platform.

        Args:
            platform: Target platform

        Returns:
            Most recent STIG entry or None
        """
        entries = self.get_by_platform(platform)
        if not entries:
            return None

        # Sort by release date (newest first), then by release number
        def sort_key(e: STIGEntry) -> tuple:
            return (
                e.release_date or date.min,
                e.release,
                e.version,
            )

        return max(entries, key=sort_key)

    def to_dict(self) -> dict[str, Any]:
        """Export catalog to dictionary."""
        return {
            "library_path": str(self.library_path) if self.library_path else None,
            "entries": [e.to_dict() for e in self._entries.values()],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "STIGCatalog":
        """Create catalog from dictionary."""
        catalog = cls(library_path=data.get("library_path"))
        for entry_data in data.get("entries", []):
            catalog.add_entry(STIGEntry.from_dict(entry_data))
        return catalog

    def __len__(self) -> int:
        """Return number of entries in catalog."""
        return len(self._entries)

    def __contains__(self, benchmark_id: str) -> bool:
        """Check if benchmark ID exists in catalog."""
        return benchmark_id in self._entries
