"""STIG Library Indexer for scanning and indexing STIG ZIP files."""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Callable

from .catalog import STIGCatalog, STIGEntry
from .parser import XCCDFParser, XCCDFRule

logger = logging.getLogger(__name__)


class STIGLibraryIndexer:
    """Scans a STIG Library folder and builds an index of available STIGs.

    The indexer:
    - Scans for ZIP files containing XCCDF XML
    - Extracts metadata from each STIG
    - Builds a searchable catalog
    - Optionally caches the index for faster startup
    """

    # Default cache filename
    CACHE_FILENAME = "stig_library_index.json"

    def __init__(self, library_path: Path | str):
        """Initialize indexer.

        Args:
            library_path: Path to STIG Library folder
        """
        self.library_path = Path(library_path)
        self.catalog = STIGCatalog(library_path=self.library_path)
        self.parser = XCCDFParser()

        # Rule storage (optional - can be large)
        self._rules_by_benchmark: dict[str, list[XCCDFRule]] = {}

        # Statistics
        self.stats = {
            "total_zips": 0,
            "parsed_ok": 0,
            "parse_errors": 0,
            "total_rules": 0,
            "last_indexed": None,
        }

    @property
    def cache_path(self) -> Path:
        """Get path to index cache file."""
        return self.library_path / self.CACHE_FILENAME

    def scan(
        self,
        progress_callback: Callable[[int, int, str], None] | None = None,
        include_rules: bool = False,
    ) -> STIGCatalog:
        """Scan library folder and build catalog.

        Args:
            progress_callback: Optional callback(current, total, filename)
            include_rules: Whether to also extract all rules (memory intensive)

        Returns:
            Populated STIGCatalog
        """
        # Find all ZIP files
        zip_files = list(self.library_path.glob("**/*.zip"))
        self.stats["total_zips"] = len(zip_files)

        logger.info(f"Scanning {len(zip_files)} ZIP files in {self.library_path}")

        for i, zip_path in enumerate(zip_files):
            if progress_callback:
                progress_callback(i + 1, len(zip_files), zip_path.name)

            try:
                entry, rules = self.parser.parse_zip(zip_path)

                if entry:
                    self.catalog.add_entry(entry)
                    self.stats["parsed_ok"] += 1
                    self.stats["total_rules"] += len(rules)

                    if include_rules:
                        self._rules_by_benchmark[entry.benchmark_id] = rules

                    logger.debug(
                        f"Indexed: {entry.benchmark_id} - {entry.title[:50]}... "
                        f"({entry.rules_count} rules)"
                    )
                else:
                    self.stats["parse_errors"] += 1
                    logger.warning(f"Failed to parse: {zip_path.name}")

            except Exception as e:
                self.stats["parse_errors"] += 1
                logger.error(f"Error scanning {zip_path.name}: {e}")

        self.stats["last_indexed"] = datetime.utcnow().isoformat()

        logger.info(
            f"Indexing complete: {self.stats['parsed_ok']}/{self.stats['total_zips']} STIGs, "
            f"{self.stats['total_rules']} total rules"
        )

        return self.catalog

    def save_cache(self) -> None:
        """Save catalog index to cache file."""
        cache_data = {
            "version": "1.0",
            "indexed_at": self.stats["last_indexed"],
            "stats": self.stats,
            "catalog": self.catalog.to_dict(),
        }

        try:
            with open(self.cache_path, "w", encoding="utf-8") as f:
                json.dump(cache_data, f, indent=2)
            logger.info(f"Saved index cache to {self.cache_path}")
        except Exception as e:
            logger.error(f"Failed to save cache: {e}")

    def load_cache(self) -> bool:
        """Load catalog from cache file if available.

        Returns:
            True if cache was loaded successfully
        """
        if not self.cache_path.exists():
            return False

        try:
            with open(self.cache_path, "r", encoding="utf-8") as f:
                cache_data = json.load(f)

            self.catalog = STIGCatalog.from_dict(cache_data["catalog"])
            self.stats = cache_data.get("stats", self.stats)

            logger.info(
                f"Loaded index cache: {len(self.catalog)} STIGs "
                f"(indexed {cache_data.get('indexed_at', 'unknown')})"
            )
            return True

        except Exception as e:
            logger.warning(f"Failed to load cache: {e}")
            return False

    def get_or_scan(
        self,
        force_rescan: bool = False,
        progress_callback: Callable[[int, int, str], None] | None = None,
    ) -> STIGCatalog:
        """Get catalog from cache or scan if needed.

        Args:
            force_rescan: Force re-scan even if cache exists
            progress_callback: Optional progress callback

        Returns:
            Populated STIGCatalog
        """
        if not force_rescan and self.load_cache():
            return self.catalog

        self.scan(progress_callback=progress_callback)
        self.save_cache()
        return self.catalog

    def get_rules(self, benchmark_id: str) -> list[XCCDFRule]:
        """Get rules for a specific STIG.

        If rules weren't loaded during scan, parses the ZIP on demand.

        Args:
            benchmark_id: STIG benchmark ID

        Returns:
            List of rules
        """
        # Check if already loaded
        if benchmark_id in self._rules_by_benchmark:
            return self._rules_by_benchmark[benchmark_id]

        # Get entry to find ZIP file
        entry = self.catalog.get_entry(benchmark_id)
        if not entry or not entry.zip_filename:
            return []

        # Parse ZIP to get rules
        zip_path = self.library_path / entry.zip_filename
        if not zip_path.exists():
            # Try searching in subdirectories
            matches = list(self.library_path.glob(f"**/{entry.zip_filename}"))
            if matches:
                zip_path = matches[0]
            else:
                logger.warning(f"ZIP file not found: {entry.zip_filename}")
                return []

        _, rules = self.parser.parse_zip(zip_path)
        self._rules_by_benchmark[benchmark_id] = rules
        return rules

    def clear_rules_cache(self) -> None:
        """Clear cached rules to free memory."""
        self._rules_by_benchmark.clear()

    def get_stig_for_platform(self, platform_value: str) -> list[STIGEntry]:
        """Get STIGs applicable to a platform.

        Args:
            platform_value: Platform string value (e.g., "arista_eos")

        Returns:
            List of applicable STIGs
        """
        from ..models.target import Platform

        try:
            platform = Platform(platform_value)
            return self.catalog.get_by_platform(platform)
        except ValueError:
            logger.warning(f"Unknown platform: {platform_value}")
            return []

    def summary(self) -> dict:
        """Get summary of indexed library.

        Returns:
            Summary dictionary
        """
        from collections import Counter
        from ..models.target import Platform

        platform_counts: Counter = Counter()
        stig_count = 0
        srg_count = 0

        for entry in self.catalog.entries:
            if entry.stig_type.value == "stig":
                stig_count += 1
            else:
                srg_count += 1

            for platform in entry.platforms:
                platform_counts[platform.value] += 1

        return {
            "library_path": str(self.library_path),
            "total_entries": len(self.catalog),
            "stigs": stig_count,
            "srgs": srg_count,
            "total_rules": self.stats["total_rules"],
            "platforms_covered": dict(platform_counts),
            "last_indexed": self.stats["last_indexed"],
        }


# Singleton instance for application-wide use
_global_indexer: STIGLibraryIndexer | None = None


def get_library_indexer(library_path: Path | str | None = None) -> STIGLibraryIndexer | None:
    """Get or create the global library indexer.

    Args:
        library_path: Path to library (required on first call)

    Returns:
        STIGLibraryIndexer instance or None
    """
    global _global_indexer

    if _global_indexer is None:
        if library_path is None:
            return None
        _global_indexer = STIGLibraryIndexer(library_path)

    return _global_indexer


def initialize_library(
    library_path: Path | str,
    force_rescan: bool = False,
    progress_callback: Callable[[int, int, str], None] | None = None,
) -> STIGCatalog:
    """Initialize the STIG library.

    Args:
        library_path: Path to STIG library folder
        force_rescan: Force re-scan even if cache exists
        progress_callback: Optional progress callback

    Returns:
        Populated STIGCatalog
    """
    global _global_indexer

    _global_indexer = STIGLibraryIndexer(library_path)
    return _global_indexer.get_or_scan(
        force_rescan=force_rescan,
        progress_callback=progress_callback,
    )
