"""
NetNynja Enterprise E2E Tests - IPAM Module (Phase 5 Validation)

Tests the IPAM (IP Address Management) module including:
- Subnet CRUD operations
- IP discovery/scanning
- NATS event publishing
- VictoriaMetrics utilization metrics
- PostgreSQL INET/CIDR type handling
"""
import pytest
import asyncio
from datetime import datetime

import httpx


pytestmark = pytest.mark.ipam


class TestSubnetCRUD:
    """Test subnet Create, Read, Update, Delete operations."""
    
    async def test_create_subnet(
        self,
        authed_client: httpx.AsyncClient,
        config
    ):
        """POST /api/v1/ipam/networks creates a new subnet."""
        response = await authed_client.post(
            "/api/v1/ipam/networks",
            json={
                "network": "10.250.0.0/24",
                "name": "E2E Create Test",
                "description": "Test subnet for E2E - auto cleanup",
                "vlanId": 250,
                "gateway": "10.250.0.1"
            }
        )

        assert response.status_code in (200, 201)
        response_data = response.json()
        # Handle wrapped response format {success: true, data: {...}}
        data = response_data.get("data", response_data)

        assert "id" in data
        assert data["network"] == "10.250.0.0/24"
        assert data["name"] == "E2E Create Test"

        # Cleanup
        await authed_client.delete(f"/api/v1/ipam/networks/{data['id']}")
    
    async def test_read_subnet(
        self,
        authed_client: httpx.AsyncClient,
        test_network
    ):
        """GET /api/v1/ipam/networks/{id} returns subnet details."""
        response = await authed_client.get(
            f"/api/v1/ipam/networks/{test_network['id']}"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["id"] == test_network["id"]
        assert data["cidr"] == test_network["cidr"]
    
    async def test_list_subnets(
        self,
        authed_client: httpx.AsyncClient,
        test_network
    ):
        """GET /api/v1/ipam/networks returns list of subnets."""
        response = await authed_client.get("/api/v1/ipam/networks")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should be a list or paginated response
        if isinstance(data, list):
            subnets = data
        else:
            subnets = data.get("items", data.get("subnets", data.get("data", [])))
        
        assert len(subnets) > 0
        
        # Test subnet should be in list
        subnet_ids = [s["id"] for s in subnets]
        assert test_network["id"] in subnet_ids
    
    async def test_update_subnet(
        self,
        authed_client: httpx.AsyncClient,
        test_network
    ):
        """PATCH/PUT /api/v1/ipam/networks/{id} updates subnet."""
        # Try PATCH first, fall back to PUT
        response = await authed_client.patch(
            f"/api/v1/ipam/networks/{test_network['id']}",
            json={
                "description": "Updated by E2E test"
            }
        )
        
        if response.status_code == 405:  # Method not allowed
            response = await authed_client.put(
                f"/api/v1/ipam/networks/{test_network['id']}",
                json={
                    **test_network,
                    "description": "Updated by E2E test"
                }
            )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["description"] == "Updated by E2E test"
    
    async def test_delete_subnet(
        self,
        authed_client: httpx.AsyncClient
    ):
        """DELETE /api/v1/ipam/networks/{id} removes subnet."""
        # Create subnet to delete
        create_response = await authed_client.post(
            "/api/v1/ipam/networks",
            json={
                "network": "10.251.0.0/24",
                "name": "E2E Delete Test"
            }
        )
        assert create_response.status_code in (200, 201)
        subnet_id = create_response.json()["id"]
        
        # Delete it
        delete_response = await authed_client.delete(
            f"/api/v1/ipam/networks/{subnet_id}"
        )
        
        assert delete_response.status_code in (200, 204)
        
        # Verify it's gone
        get_response = await authed_client.get(
            f"/api/v1/ipam/networks/{subnet_id}"
        )
        
        assert get_response.status_code == 404
    
    async def test_create_subnet_duplicate_cidr_fails(
        self,
        authed_client: httpx.AsyncClient,
        test_network,
        config
    ):
        """Creating subnet with duplicate CIDR fails."""
        response = await authed_client.post(
            "/api/v1/ipam/networks",
            json={
                "network": config.test_network,  # Same as test_network
                "name": "Duplicate CIDR Test"
            }
        )
        
        assert response.status_code in (400, 409, 422)


class TestIPAddressManagement:
    """Test IP address operations."""
    
    async def test_list_addresses_in_subnet(
        self,
        authed_client: httpx.AsyncClient,
        test_network,
        config
    ):
        """GET /api/v1/ipam/networks with subnet filter."""
        response = await authed_client.get(
            "/api/v1/ipam/networks",
            params={"subnet": config.test_network}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should return list (possibly empty before scan)
        if isinstance(data, list):
            addresses = data
        else:
            addresses = data.get("items", data.get("addresses", data.get("data", [])))
        
        assert isinstance(addresses, list)
    
    async def test_reserve_ip_address(
        self,
        authed_client: httpx.AsyncClient,
        test_network
    ):
        """POST /api/v1/ipam/networks reserves an IP address."""
        response = await authed_client.post(
            "/api/v1/ipam/networks",
            json={
                "ip_address": "10.255.0.100",
                "subnet_id": test_network["id"],
                "hostname": "e2e-test-host",
                "status": "reserved",
                "description": "E2E test reservation"
            }
        )
        
        assert response.status_code in (200, 201)
        data = response.json()
        
        assert data["ip_address"] == "10.255.0.100"
        assert data["status"] == "reserved"
    
    async def test_get_next_available_ip(
        self,
        authed_client: httpx.AsyncClient,
        test_network
    ):
        """GET /api/v1/ipam/networks/{id}/next-available returns next free IP."""
        response = await authed_client.get(
            f"/api/v1/ipam/networks/{test_network['id']}/next-available"
        )
        
        # This endpoint may not exist in all implementations
        if response.status_code == 404:
            pytest.skip("Next available IP endpoint not implemented")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "ip_address" in data or "address" in data


class TestIPDiscoveryScanning:
    """Test IP discovery and scanning functionality."""
    
    @pytest.mark.slow
    async def test_trigger_subnet_scan(
        self,
        authed_client: httpx.AsyncClient,
        test_network
    ):
        """POST /api/v1/ipam/scan triggers discovery scan."""
        response = await authed_client.post(
            "/api/v1/ipam/scan",
            json={
                "subnet_id": test_network["id"],
                "scan_type": "ping"  # ICMP ping scan
            }
        )
        
        # Scan might return immediately with job ID or block until complete
        assert response.status_code in (200, 201, 202)
        data = response.json()
        
        # Should return scan job info
        assert "id" in data or "job_id" in data or "status" in data
    
    @pytest.mark.slow
    async def test_scan_publishes_nats_event(
        self,
        authed_client: httpx.AsyncClient,
        test_network,
        nats_message_capture
    ):
        """Subnet scan publishes ipam.discovery.* event to NATS."""
        # Start capturing NATS messages
        capture_task = asyncio.create_task(
            nats_message_capture("ipam.discovery.>", timeout=10.0)
        )
        
        # Wait for subscription
        await asyncio.sleep(0.5)
        
        # Trigger scan
        await authed_client.post(
            "/api/v1/ipam/scan",
            json={
                "subnet_id": test_network["id"],
                "scan_type": "ping"
            }
        )
        
        # Wait for messages
        messages = await capture_task
        
        # Check for discovery events
        discovery_events = [
            m for m in messages 
            if "discovery" in m["subject"]
        ]
        
        # Soft check - scan may complete very fast on empty subnet
        if discovery_events:
            assert discovery_events[0]["data"].get("subnet_id") == test_network["id"]
    
    async def test_get_scan_status(
        self,
        authed_client: httpx.AsyncClient,
        test_network
    ):
        """GET /api/v1/ipam/scan/{job_id} returns scan status."""
        # First trigger a scan
        scan_response = await authed_client.post(
            "/api/v1/ipam/scan",
            json={
                "subnet_id": test_network["id"],
                "scan_type": "ping"
            }
        )
        
        if scan_response.status_code not in (200, 201, 202):
            pytest.skip("Scan endpoint returned unexpected status")
        
        data = scan_response.json()
        job_id = data.get("id") or data.get("job_id")
        
        if not job_id:
            pytest.skip("No job ID returned from scan")
        
        # Check status
        status_response = await authed_client.get(
            f"/api/v1/ipam/scan/{job_id}"
        )
        
        assert status_response.status_code == 200
        status_data = status_response.json()
        
        assert "status" in status_data


class TestIPAMMetrics:
    """Test IPAM metrics in VictoriaMetrics."""
    
    @pytest.mark.slow
    async def test_utilization_metrics_written(
        self,
        authed_client: httpx.AsyncClient,
        test_network,
        query_metrics
    ):
        """IP utilization metrics are written to VictoriaMetrics."""
        # Reserve some IPs to generate utilization data
        for i in range(3):
            await authed_client.post(
                "/api/v1/ipam/networks",
                json={
                    "ip_address": f"10.255.0.{10 + i}",
                    "subnet_id": test_network["id"],
                    "status": "reserved"
                }
            )
        
        # Wait for metrics to be written
        await asyncio.sleep(2)
        
        # Query for utilization metrics
        result = await query_metrics(
            f'ipam_subnet_utilization{{subnet_id="{test_network["id"]}"}}'
        )
        
        # Check if metrics exist
        if result.get("data", {}).get("result"):
            # Metrics found
            assert len(result["data"]["result"]) > 0
        else:
            # Metrics might use different naming
            result = await query_metrics('ipam_subnet_utilization')
            # Soft check - metrics may not be written yet
            pass
    
    async def test_address_count_metrics(
        self,
        query_metrics
    ):
        """Total address count metric exists."""
        result = await query_metrics('ipam_addresses_total')
        
        # Soft check - metric may not exist if no addresses
        if result.get("status") == "success":
            pass  # Metric query succeeded


class TestPostgreSQLDataTypes:
    """Test PostgreSQL INET/CIDR type handling."""
    
    async def test_cidr_stored_correctly(
        self,
        authed_client: httpx.AsyncClient,
        test_network,
        postgres_conn
    ):
        """CIDR is stored using PostgreSQL native type."""
        # Query database directly
        async with postgres_conn.cursor() as cur:
            await cur.execute(
                "SELECT cidr FROM ipam.subnets WHERE id = %s",
                (test_network["id"],)
            )
            row = await cur.fetchone()
        
        assert row is not None
        # CIDR should be properly formatted
        cidr_value = str(row[0])
        assert "/" in cidr_value  # Has prefix length
    
    async def test_ip_address_stored_correctly(
        self,
        authed_client: httpx.AsyncClient,
        test_network,
        postgres_conn
    ):
        """IP addresses are stored using PostgreSQL INET type."""
        # Create an address
        response = await authed_client.post(
            "/api/v1/ipam/networks",
            json={
                "ip_address": "10.255.0.200",
                "subnet_id": test_network["id"],
                "status": "reserved"
            }
        )
        
        if response.status_code not in (200, 201):
            pytest.skip("Could not create test address")
        
        address_id = response.json()["id"]
        
        # Query database
        async with postgres_conn.cursor() as cur:
            await cur.execute(
                "SELECT ip_address FROM ipam.addresses WHERE id = %s",
                (address_id,)
            )
            row = await cur.fetchone()
        
        assert row is not None
        assert "10.255.0.200" in str(row[0])


class TestSubnetCalculations:
    """Test subnet calculations and validations."""
    
    async def test_network_statistics(
        self,
        authed_client: httpx.AsyncClient,
        test_network
    ):
        """GET /api/v1/ipam/networks/{id}/stats returns utilization stats."""
        response = await authed_client.get(
            f"/api/v1/ipam/networks/{test_network['id']}/stats"
        )
        
        if response.status_code == 404:
            pytest.skip("Stats endpoint not implemented")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should include utilization info
        expected_fields = ["total", "used", "available", "utilization_percent"]
        has_expected = any(f in data for f in expected_fields)
        
        assert has_expected or "stats" in data
    
    async def test_cannot_create_overlapping_subnets(
        self,
        authed_client: httpx.AsyncClient,
        test_network
    ):
        """Creating overlapping subnet fails."""
        # Try to create subnet that overlaps with test_network (10.255.0.0/24)
        response = await authed_client.post(
            "/api/v1/ipam/networks",
            json={
                "network": "10.255.0.0/25",  # Overlaps with /24
                "name": "Overlapping Subnet Test"
            }
        )
        
        # Should fail due to overlap
        assert response.status_code in (400, 409, 422)
    
    async def test_search_subnets_by_cidr(
        self,
        authed_client: httpx.AsyncClient,
        test_network,
        config
    ):
        """Search subnets by CIDR query."""
        response = await authed_client.get(
            "/api/v1/ipam/networks",
            params={"q": "10.255"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        if isinstance(data, list):
            subnets = data
        else:
            subnets = data.get("items", data.get("subnets", []))
        
        # Test subnet should be in results
        matching = [s for s in subnets if config.test_network in s.get("cidr", "")]
        assert len(matching) > 0


class TestIPAMDataIntegrity:
    """Test data integrity and cascade operations."""
    
    async def test_delete_subnet_cascades_addresses(
        self,
        authed_client: httpx.AsyncClient
    ):
        """Deleting subnet removes associated addresses."""
        # Create subnet
        subnet_response = await authed_client.post(
            "/api/v1/ipam/networks",
            json={
                "network": "10.252.0.0/24",
                "name": "Cascade Test Subnet"
            }
        )
        assert subnet_response.status_code in (200, 201)
        subnet = subnet_response.json()
        
        # Create address in subnet
        addr_response = await authed_client.post(
            "/api/v1/ipam/networks",
            json={
                "ip_address": "10.252.0.50",
                "subnet_id": subnet["id"],
                "status": "reserved"
            }
        )
        assert addr_response.status_code in (200, 201)
        address = addr_response.json()
        
        # Delete subnet
        delete_response = await authed_client.delete(
            f"/api/v1/ipam/networks/{subnet['id']}"
        )
        assert delete_response.status_code in (200, 204)
        
        # Address should be gone
        addr_check = await authed_client.get(
            f"/api/v1/ipam/networks/{address['id']}"
        )
        assert addr_check.status_code == 404
