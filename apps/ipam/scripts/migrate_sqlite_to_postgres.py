#!/usr/bin/env python3
"""
SQLite to PostgreSQL Migration Script for GridWatch IPAM.

This script migrates data from an existing SQLite/SQLCipher IPAM database
to the new PostgreSQL schema with proper INET/CIDR type handling.

Usage:
    python migrate_sqlite_to_postgres.py --sqlite-path /path/to/ipam.db \
        --postgres-url postgresql://user:pass@host:5432/GridWatch

Environment:
    SQLITE_PATH - Path to SQLite database (alternative to --sqlite-path)
    POSTGRES_URL - PostgreSQL connection URL (alternative to --postgres-url)
    SQLCIPHER_KEY - SQLCipher encryption key (if database is encrypted)
"""

import argparse
import asyncio
import json
import os
import sqlite3
import sys
from datetime import datetime
from typing import Any
from uuid import uuid4

import asyncpg
from netaddr import IPNetwork, IPAddress


class MigrationError(Exception):
    """Migration-specific error."""
    pass


class SQLiteMigrator:
    """Handles SQLite to PostgreSQL migration."""

    def __init__(
        self,
        sqlite_path: str,
        postgres_url: str,
        sqlcipher_key: str | None = None,
    ):
        self.sqlite_path = sqlite_path
        self.postgres_url = postgres_url
        self.sqlcipher_key = sqlcipher_key
        self.sqlite_conn: sqlite3.Connection | None = None
        self.pg_pool: asyncpg.Pool | None = None
        self.stats = {
            "networks_migrated": 0,
            "addresses_migrated": 0,
            "scan_history_migrated": 0,
            "errors": [],
        }

    async def connect(self) -> None:
        """Establish database connections."""
        # SQLite connection
        if not os.path.exists(self.sqlite_path):
            raise MigrationError(f"SQLite database not found: {self.sqlite_path}")

        self.sqlite_conn = sqlite3.connect(self.sqlite_path)
        self.sqlite_conn.row_factory = sqlite3.Row

        # Apply SQLCipher key if provided
        if self.sqlcipher_key:
            self.sqlite_conn.execute(f"PRAGMA key = '{self.sqlcipher_key}'")

        # Test SQLite connection
        try:
            self.sqlite_conn.execute("SELECT 1").fetchone()
        except sqlite3.DatabaseError as e:
            raise MigrationError(f"Cannot read SQLite database: {e}")

        # PostgreSQL connection
        self.pg_pool = await asyncpg.create_pool(
            self.postgres_url,
            min_size=2,
            max_size=10,
            server_settings={"search_path": "ipam,shared,public"},
        )

        print("Connected to both databases")

    async def close(self) -> None:
        """Close database connections."""
        if self.sqlite_conn:
            self.sqlite_conn.close()
        if self.pg_pool:
            await self.pg_pool.close()

    def get_sqlite_tables(self) -> list[str]:
        """Get list of tables in SQLite database."""
        cursor = self.sqlite_conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
        return [row["name"] for row in cursor.fetchall()]

    def get_sqlite_schema(self, table: str) -> list[tuple[str, str]]:
        """Get schema (column name, type) for a SQLite table."""
        cursor = self.sqlite_conn.execute(f"PRAGMA table_info({table})")
        return [(row["name"], row["type"]) for row in cursor.fetchall()]

    async def migrate_networks(self) -> int:
        """Migrate networks table."""
        print("Migrating networks...")

        # Common SQLite table names for networks
        network_tables = ["networks", "subnets", "network", "subnet"]
        source_table = None

        tables = self.get_sqlite_tables()
        for t in network_tables:
            if t in tables:
                source_table = t
                break

        if not source_table:
            print("  No network table found in SQLite, skipping...")
            return 0

        cursor = self.sqlite_conn.execute(f"SELECT * FROM {source_table}")
        rows = cursor.fetchall()
        count = 0

        async with self.pg_pool.acquire() as conn:
            for row in rows:
                try:
                    row_dict = dict(row)

                    # Map common field names
                    network_cidr = (
                        row_dict.get("network") or
                        row_dict.get("cidr") or
                        row_dict.get("subnet") or
                        row_dict.get("ip_range")
                    )

                    if not network_cidr:
                        continue

                    # Normalize CIDR
                    try:
                        net = IPNetwork(network_cidr)
                        network_cidr = str(net.cidr)
                    except Exception:
                        self.stats["errors"].append(f"Invalid network: {network_cidr}")
                        continue

                    # Generate new UUID or use existing
                    network_id = row_dict.get("id") or str(uuid4())
                    if not self._is_valid_uuid(network_id):
                        network_id = str(uuid4())

                    # Map gateway
                    gateway = row_dict.get("gateway")
                    if gateway:
                        try:
                            IPAddress(gateway)
                        except Exception:
                            gateway = None

                    # Map DNS servers
                    dns_servers = row_dict.get("dns_servers")
                    if dns_servers:
                        if isinstance(dns_servers, str):
                            try:
                                dns_servers = json.loads(dns_servers)
                            except json.JSONDecodeError:
                                dns_servers = dns_servers.split(",")
                        dns_servers = [s.strip() for s in dns_servers if s.strip()]
                    else:
                        dns_servers = None

                    await conn.execute(
                        """
                        INSERT INTO ipam.networks (
                            id, name, network, vlan_id, description, location,
                            gateway, dns_servers, is_active, created_at, updated_at
                        )
                        VALUES ($1, $2, $3::cidr, $4, $5, $6, $7::inet, $8::inet[], $9, $10, $11)
                        ON CONFLICT (id) DO UPDATE SET
                            name = EXCLUDED.name,
                            network = EXCLUDED.network,
                            updated_at = NOW()
                        """,
                        network_id,
                        row_dict.get("name") or f"Network {network_cidr}",
                        network_cidr,
                        row_dict.get("vlan_id") or row_dict.get("vlan"),
                        row_dict.get("description") or row_dict.get("notes"),
                        row_dict.get("location") or row_dict.get("site"),
                        gateway,
                        dns_servers,
                        row_dict.get("is_active", True) if row_dict.get("is_active") is not None else True,
                        self._parse_datetime(row_dict.get("created_at")),
                        self._parse_datetime(row_dict.get("updated_at")),
                    )
                    count += 1

                except Exception as e:
                    self.stats["errors"].append(f"Network migration error: {e}")

        self.stats["networks_migrated"] = count
        print(f"  Migrated {count} networks")
        return count

    async def migrate_addresses(self) -> int:
        """Migrate IP addresses table."""
        print("Migrating IP addresses...")

        # Common SQLite table names for addresses
        address_tables = ["addresses", "ip_addresses", "ips", "hosts"]
        source_table = None

        tables = self.get_sqlite_tables()
        for t in address_tables:
            if t in tables:
                source_table = t
                break

        if not source_table:
            print("  No addresses table found in SQLite, skipping...")
            return 0

        cursor = self.sqlite_conn.execute(f"SELECT * FROM {source_table}")
        rows = cursor.fetchall()
        count = 0

        async with self.pg_pool.acquire() as conn:
            for row in rows:
                try:
                    row_dict = dict(row)

                    # Map common field names
                    ip_address = (
                        row_dict.get("address") or
                        row_dict.get("ip_address") or
                        row_dict.get("ip")
                    )

                    if not ip_address:
                        continue

                    # Validate IP
                    try:
                        IPAddress(ip_address)
                    except Exception:
                        self.stats["errors"].append(f"Invalid IP: {ip_address}")
                        continue

                    # Get network_id - may need to look up by CIDR
                    network_id = row_dict.get("network_id") or row_dict.get("subnet_id")
                    if not network_id or not self._is_valid_uuid(network_id):
                        # Try to find network by matching IP
                        network = await conn.fetchrow(
                            "SELECT id FROM ipam.networks WHERE network >> $1::inet",
                            ip_address,
                        )
                        if network:
                            network_id = str(network["id"])
                        else:
                            self.stats["errors"].append(f"No network for IP: {ip_address}")
                            continue

                    # Generate new UUID or use existing
                    address_id = row_dict.get("id") or str(uuid4())
                    if not self._is_valid_uuid(address_id):
                        address_id = str(uuid4())

                    # Map MAC address
                    mac_address = row_dict.get("mac_address") or row_dict.get("mac")
                    if mac_address:
                        # Normalize MAC format
                        mac_address = mac_address.replace("-", ":").upper()

                    # Map status
                    status = row_dict.get("status") or "unknown"
                    status = status.lower()
                    if status not in ("active", "inactive", "reserved", "dhcp", "unknown"):
                        status = "unknown"

                    await conn.execute(
                        """
                        INSERT INTO ipam.addresses (
                            id, network_id, address, mac_address, hostname, fqdn,
                            status, device_type, description, last_seen, discovered_at,
                            created_at, updated_at
                        )
                        VALUES ($1, $2, $3::inet, $4::macaddr, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                        ON CONFLICT (network_id, address) DO UPDATE SET
                            mac_address = COALESCE(EXCLUDED.mac_address, ipam.addresses.mac_address),
                            hostname = COALESCE(EXCLUDED.hostname, ipam.addresses.hostname),
                            status = EXCLUDED.status,
                            last_seen = EXCLUDED.last_seen,
                            updated_at = NOW()
                        """,
                        address_id,
                        network_id,
                        ip_address,
                        mac_address,
                        row_dict.get("hostname"),
                        row_dict.get("fqdn"),
                        status,
                        row_dict.get("device_type") or row_dict.get("type"),
                        row_dict.get("description") or row_dict.get("notes"),
                        self._parse_datetime(row_dict.get("last_seen")),
                        self._parse_datetime(row_dict.get("discovered_at") or row_dict.get("first_seen")),
                        self._parse_datetime(row_dict.get("created_at")),
                        self._parse_datetime(row_dict.get("updated_at")),
                    )
                    count += 1

                except Exception as e:
                    self.stats["errors"].append(f"Address migration error: {e}")

        self.stats["addresses_migrated"] = count
        print(f"  Migrated {count} addresses")
        return count

    async def migrate_scan_history(self) -> int:
        """Migrate scan history table."""
        print("Migrating scan history...")

        # Common SQLite table names for scan history
        scan_tables = ["scan_history", "scans", "scan_jobs"]
        source_table = None

        tables = self.get_sqlite_tables()
        for t in scan_tables:
            if t in tables:
                source_table = t
                break

        if not source_table:
            print("  No scan history table found in SQLite, skipping...")
            return 0

        cursor = self.sqlite_conn.execute(f"SELECT * FROM {source_table}")
        rows = cursor.fetchall()
        count = 0

        async with self.pg_pool.acquire() as conn:
            for row in rows:
                try:
                    row_dict = dict(row)

                    network_id = row_dict.get("network_id") or row_dict.get("subnet_id")
                    if not network_id or not self._is_valid_uuid(network_id):
                        continue

                    scan_id = row_dict.get("id") or str(uuid4())
                    if not self._is_valid_uuid(scan_id):
                        scan_id = str(uuid4())

                    await conn.execute(
                        """
                        INSERT INTO ipam.scan_history (
                            id, network_id, scan_type, started_at, completed_at,
                            total_ips, active_ips, new_ips, status, error_message
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        scan_id,
                        network_id,
                        row_dict.get("scan_type") or "ping",
                        self._parse_datetime(row_dict.get("started_at") or row_dict.get("start_time")),
                        self._parse_datetime(row_dict.get("completed_at") or row_dict.get("end_time")),
                        row_dict.get("total_ips") or row_dict.get("total"),
                        row_dict.get("active_ips") or row_dict.get("active") or row_dict.get("alive"),
                        row_dict.get("new_ips") or row_dict.get("new"),
                        row_dict.get("status") or "completed",
                        row_dict.get("error_message") or row_dict.get("error"),
                    )
                    count += 1

                except Exception as e:
                    self.stats["errors"].append(f"Scan history migration error: {e}")

        self.stats["scan_history_migrated"] = count
        print(f"  Migrated {count} scan records")
        return count

    async def run(self) -> dict[str, Any]:
        """Execute the full migration."""
        print(f"\n{'='*60}")
        print("GridWatch IPAM Migration: SQLite to PostgreSQL")
        print(f"{'='*60}")
        print(f"Source: {self.sqlite_path}")
        print(f"Target: {self.postgres_url.split('@')[-1]}")  # Hide credentials
        print(f"{'='*60}\n")

        try:
            await self.connect()

            # Show source tables
            tables = self.get_sqlite_tables()
            print(f"Found {len(tables)} tables in SQLite: {', '.join(tables)}\n")

            # Run migrations
            await self.migrate_networks()
            await self.migrate_addresses()
            await self.migrate_scan_history()

            # Summary
            print(f"\n{'='*60}")
            print("Migration Summary")
            print(f"{'='*60}")
            print(f"Networks migrated:    {self.stats['networks_migrated']}")
            print(f"Addresses migrated:   {self.stats['addresses_migrated']}")
            print(f"Scan history migrated: {self.stats['scan_history_migrated']}")

            if self.stats["errors"]:
                print(f"\nErrors ({len(self.stats['errors'])}):")
                for error in self.stats["errors"][:10]:
                    print(f"  - {error}")
                if len(self.stats["errors"]) > 10:
                    print(f"  ... and {len(self.stats['errors']) - 10} more")

            print(f"{'='*60}\n")

            return self.stats

        finally:
            await self.close()

    def _is_valid_uuid(self, value: str) -> bool:
        """Check if string is a valid UUID."""
        try:
            from uuid import UUID
            UUID(str(value))
            return True
        except (ValueError, AttributeError):
            return False

    def _parse_datetime(self, value: Any) -> datetime | None:
        """Parse datetime from various formats."""
        if value is None:
            return datetime.now()

        if isinstance(value, datetime):
            return value

        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value)

        if isinstance(value, str):
            for fmt in [
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%dT%H:%M:%S.%f",
                "%Y-%m-%d",
            ]:
                try:
                    return datetime.strptime(value, fmt)
                except ValueError:
                    continue

        return datetime.now()


async def main():
    parser = argparse.ArgumentParser(
        description="Migrate IPAM data from SQLite to PostgreSQL"
    )
    parser.add_argument(
        "--sqlite-path",
        default=os.environ.get("SQLITE_PATH"),
        help="Path to SQLite database file",
    )
    parser.add_argument(
        "--postgres-url",
        default=os.environ.get("POSTGRES_URL"),
        help="PostgreSQL connection URL",
    )
    parser.add_argument(
        "--sqlcipher-key",
        default=os.environ.get("SQLCIPHER_KEY"),
        help="SQLCipher encryption key (if encrypted)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be migrated without making changes",
    )

    args = parser.parse_args()

    if not args.sqlite_path:
        print("Error: --sqlite-path or SQLITE_PATH environment variable required")
        sys.exit(1)

    if not args.postgres_url:
        print("Error: --postgres-url or POSTGRES_URL environment variable required")
        sys.exit(1)

    if args.dry_run:
        print("DRY RUN - no changes will be made")
        # TODO: Implement dry run mode
        return

    migrator = SQLiteMigrator(
        sqlite_path=args.sqlite_path,
        postgres_url=args.postgres_url,
        sqlcipher_key=args.sqlcipher_key,
    )

    stats = await migrator.run()

    # Exit with error code if there were failures
    if stats["errors"]:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
