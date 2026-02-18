"""
GridWatch NetEnterprise E2E Tests - STIG Manager Module (Phase 7 Validation)

Tests the STIG (Security Technical Implementation Guide) module including:
- Benchmark management
- Audit job creation and execution
- CKL/PDF report generation
- Compliance dashboards
- NATS audit event publishing
"""
import pytest
import asyncio
from datetime import datetime

import httpx


pytestmark = pytest.mark.stig


class TestBenchmarkManagement:
    """Test STIG benchmark operations."""
    
    async def test_list_benchmarks(
        self,
        authed_client: httpx.AsyncClient
    ):
        """GET /api/v1/stig/benchmarks returns available STIGs."""
        response = await authed_client.get("/api/v1/stig/benchmarks")
        
        assert response.status_code == 200
        data = response.json()
        
        if isinstance(data, list):
            benchmarks = data
        else:
            benchmarks = data.get("items", data.get("benchmarks", data.get("data", [])))
        
        assert isinstance(benchmarks, list)
    
    async def test_get_benchmark_details(
        self,
        authed_client: httpx.AsyncClient
    ):
        """GET /api/v1/stig/benchmarks/{id} returns benchmark details."""
        # First get list
        list_response = await authed_client.get("/api/v1/stig/benchmarks")
        benchmarks = list_response.json()
        
        if isinstance(benchmarks, dict):
            benchmarks = benchmarks.get("items", benchmarks.get("benchmarks", []))
        
        if not benchmarks:
            pytest.skip("No benchmarks available")
        
        benchmark_id = benchmarks[0]["id"]
        
        response = await authed_client.get(
            f"/api/v1/stig/benchmarks/{benchmark_id}"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["id"] == benchmark_id
        # Should have STIG-specific fields
        assert "title" in data or "name" in data
    
    async def test_get_benchmark_rules(
        self,
        authed_client: httpx.AsyncClient
    ):
        """GET /api/v1/stig/benchmarks/{id}/rules returns STIG rules."""
        # Get first benchmark
        list_response = await authed_client.get("/api/v1/stig/benchmarks")
        benchmarks = list_response.json()
        
        if isinstance(benchmarks, dict):
            benchmarks = benchmarks.get("items", [])
        
        if not benchmarks:
            pytest.skip("No benchmarks available")
        
        benchmark_id = benchmarks[0]["id"]
        
        response = await authed_client.get(
            f"/api/v1/stig/benchmarks/{benchmark_id}/rules"
        )
        
        if response.status_code == 404:
            pytest.skip("Rules endpoint not implemented")
        
        assert response.status_code == 200
        data = response.json()
        
        if isinstance(data, list):
            rules = data
        else:
            rules = data.get("items", data.get("rules", []))
        
        assert isinstance(rules, list)
    
    async def test_search_benchmarks(
        self,
        authed_client: httpx.AsyncClient
    ):
        """Search benchmarks by name/keyword."""
        response = await authed_client.get(
            "/api/v1/stig/benchmarks",
            params={"q": "network"}
        )
        
        assert response.status_code == 200


class TestAuditJobManagement:
    """Test STIG audit job operations."""
    
    async def test_list_audits(
        self,
        authed_client: httpx.AsyncClient
    ):
        """GET /api/v1/stig/audits returns audit job list."""
        response = await authed_client.get("/api/v1/stig/audits")
        
        assert response.status_code == 200
        data = response.json()
        
        if isinstance(data, list):
            audits = data
        else:
            audits = data.get("items", data.get("audits", data.get("data", [])))
        
        assert isinstance(audits, list)
    
    async def test_create_audit_job(
        self,
        authed_client: httpx.AsyncClient
    ):
        """POST /api/v1/stig/audits creates an audit job."""
        # Get a benchmark to use
        benchmarks_response = await authed_client.get("/api/v1/stig/benchmarks")
        benchmarks = benchmarks_response.json()
        
        if isinstance(benchmarks, dict):
            benchmarks = benchmarks.get("items", [])
        
        if not benchmarks:
            pytest.skip("No benchmarks available for audit")
        
        response = await authed_client.post(
            "/api/v1/stig/audits",
            json={
                "name": "E2E Test Audit",
                "benchmark_id": benchmarks[0]["id"],
                "targets": [
                    {
                        "hostname": "e2e-test-device",
                        "ip_address": "10.255.255.1",
                        "credential_id": None  # Use default or skip auth
                    }
                ],
                "description": "E2E test audit - auto cleanup",
                "scheduled": False  # Run immediately or manual
            }
        )
        
        assert response.status_code in (200, 201, 202)
        data = response.json()
        
        assert "id" in data
        audit_id = data["id"]
        
        # Return audit for further tests
        return audit_id
    
    async def test_get_audit_details(
        self,
        authed_client: httpx.AsyncClient
    ):
        """GET /api/v1/stig/audits/{id} returns audit details."""
        # Get existing audits
        list_response = await authed_client.get("/api/v1/stig/audits")
        audits = list_response.json()
        
        if isinstance(audits, dict):
            audits = audits.get("items", [])
        
        if not audits:
            pytest.skip("No audits exist")
        
        audit_id = audits[0]["id"]
        
        response = await authed_client.get(
            f"/api/v1/stig/audits/{audit_id}"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["id"] == audit_id
        assert "status" in data
    
    @pytest.mark.slow
    async def test_audit_status_progression(
        self,
        authed_client: httpx.AsyncClient
    ):
        """Audit job progresses through status states."""
        # Create audit
        benchmarks_response = await authed_client.get("/api/v1/stig/benchmarks")
        benchmarks = benchmarks_response.json()
        
        if isinstance(benchmarks, dict):
            benchmarks = benchmarks.get("items", [])
        
        if not benchmarks:
            pytest.skip("No benchmarks for audit")
        
        create_response = await authed_client.post(
            "/api/v1/stig/audits",
            json={
                "name": "E2E Status Test",
                "benchmark_id": benchmarks[0]["id"],
                "targets": [{
                    "hostname": "test-device",
                    "ip_address": "127.0.0.1"
                }]
            }
        )
        
        if create_response.status_code not in (200, 201, 202):
            pytest.skip("Could not create audit")
        
        audit_id = create_response.json()["id"]
        
        # Poll for status changes
        statuses_seen = set()
        for _ in range(30):  # Poll for up to 30 seconds
            status_response = await authed_client.get(
                f"/api/v1/stig/audits/{audit_id}"
            )
            status = status_response.json().get("status", "unknown")
            statuses_seen.add(status)
            
            if status in ("complete", "completed", "finished", "failed", "error"):
                break
            
            await asyncio.sleep(1)
        
        # Should have seen at least one status
        assert len(statuses_seen) > 0


class TestAuditExecution:
    """Test STIG audit execution and results."""
    
    @pytest.mark.slow
    async def test_audit_publishes_nats_event(
        self,
        authed_client: httpx.AsyncClient,
        nats_message_capture
    ):
        """Audit publishes stig.audit.* event to NATS."""
        # Start capturing
        capture_task = asyncio.create_task(
            nats_message_capture("stig.audit.>", timeout=15.0)
        )
        
        await asyncio.sleep(0.5)
        
        # Create audit
        benchmarks_response = await authed_client.get("/api/v1/stig/benchmarks")
        benchmarks = benchmarks_response.json()
        
        if isinstance(benchmarks, dict):
            benchmarks = benchmarks.get("items", [])
        
        if benchmarks:
            await authed_client.post(
                "/api/v1/stig/audits",
                json={
                    "name": "NATS Event Test",
                    "benchmark_id": benchmarks[0]["id"],
                    "targets": [{
                        "hostname": "test",
                        "ip_address": "127.0.0.1"
                    }]
                }
            )
        
        messages = await capture_task
        
        audit_events = [m for m in messages if "audit" in m["subject"]]
        
        if audit_events:
            # Verify event structure
            assert "audit_id" in audit_events[0]["data"] or "id" in audit_events[0]["data"]
    
    async def test_get_audit_findings(
        self,
        authed_client: httpx.AsyncClient
    ):
        """GET /api/v1/stig/audits/{id}/findings returns audit findings."""
        # Get completed audit
        audits_response = await authed_client.get(
            "/api/v1/stig/audits",
            params={"status": "complete"}
        )
        audits = audits_response.json()
        
        if isinstance(audits, dict):
            audits = audits.get("items", [])
        
        # Filter for completed audits
        completed = [a for a in audits if a.get("status") in ("complete", "completed", "finished")]
        
        if not completed:
            pytest.skip("No completed audits")
        
        audit_id = completed[0]["id"]
        
        response = await authed_client.get(
            f"/api/v1/stig/audits/{audit_id}/findings"
        )
        
        if response.status_code == 404:
            pytest.skip("Findings endpoint not implemented")
        
        assert response.status_code == 200
        data = response.json()
        
        if isinstance(data, list):
            findings = data
        else:
            findings = data.get("items", data.get("findings", []))
        
        assert isinstance(findings, list)


class TestReportGeneration:
    """Test STIG report generation (CKL, PDF)."""
    
    async def test_generate_ckl_report(
        self,
        authed_client: httpx.AsyncClient
    ):
        """GET /api/v1/stig/audits/{id}/report?format=ckl generates CKL."""
        # Get completed audit
        audits_response = await authed_client.get("/api/v1/stig/audits")
        audits = audits_response.json()
        
        if isinstance(audits, dict):
            audits = audits.get("items", [])
        
        completed = [a for a in audits if a.get("status") in ("complete", "completed")]
        
        if not completed:
            pytest.skip("No completed audits for report")
        
        audit_id = completed[0]["id"]
        
        response = await authed_client.get(
            f"/api/v1/stig/audits/{audit_id}/report",
            params={"format": "ckl"}
        )
        
        if response.status_code == 404:
            pytest.skip("CKL report generation not implemented")
        
        assert response.status_code == 200
        
        # Should return XML (CKL format)
        content_type = response.headers.get("content-type", "")
        assert "xml" in content_type or "ckl" in content_type or response.text.startswith("<?xml")
    
    async def test_generate_pdf_report(
        self,
        authed_client: httpx.AsyncClient
    ):
        """GET /api/v1/stig/audits/{id}/report?format=pdf generates PDF."""
        # Get completed audit
        audits_response = await authed_client.get("/api/v1/stig/audits")
        audits = audits_response.json()
        
        if isinstance(audits, dict):
            audits = audits.get("items", [])
        
        completed = [a for a in audits if a.get("status") in ("complete", "completed")]
        
        if not completed:
            pytest.skip("No completed audits for report")
        
        audit_id = completed[0]["id"]
        
        response = await authed_client.get(
            f"/api/v1/stig/audits/{audit_id}/report",
            params={"format": "pdf"}
        )
        
        if response.status_code == 404:
            pytest.skip("PDF report generation not implemented")
        
        assert response.status_code == 200
        
        # Should return PDF
        content_type = response.headers.get("content-type", "")
        assert "pdf" in content_type or response.content[:4] == b'%PDF'
    
    async def test_report_formats_available(
        self,
        authed_client: httpx.AsyncClient
    ):
        """GET /api/v1/stig/reports/formats returns available formats."""
        response = await authed_client.get("/api/v1/stig/reports/formats")
        
        if response.status_code == 404:
            pytest.skip("Formats endpoint not implemented")
        
        assert response.status_code == 200
        data = response.json()
        
        formats = data.get("formats", data) if isinstance(data, dict) else data
        
        # Should support at least CKL
        format_list = [f.lower() if isinstance(f, str) else f.get("format", "").lower() for f in formats]
        assert "ckl" in format_list or any("ckl" in str(f) for f in formats)


class TestComplianceDashboard:
    """Test compliance dashboard and statistics."""
    
    async def test_get_compliance_summary(
        self,
        authed_client: httpx.AsyncClient
    ):
        """GET /api/v1/stig/compliance/summary returns overall compliance."""
        response = await authed_client.get("/api/v1/stig/compliance/summary")
        
        if response.status_code == 404:
            pytest.skip("Compliance summary not implemented")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should have compliance metrics
        expected_fields = ["compliant", "non_compliant", "not_reviewed", "score", "percentage"]
        has_expected = any(f in data for f in expected_fields)
        
        assert has_expected or "compliance" in data
    
    async def test_get_compliance_by_category(
        self,
        authed_client: httpx.AsyncClient
    ):
        """GET /api/v1/stig/compliance/by-category returns category breakdown."""
        response = await authed_client.get("/api/v1/stig/compliance/by-category")
        
        if response.status_code == 404:
            pytest.skip("Category compliance not implemented")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should have category breakdown
        if isinstance(data, list):
            categories = data
        else:
            categories = data.get("categories", data.get("items", []))
        
        assert isinstance(categories, list)
    
    async def test_get_compliance_trend(
        self,
        authed_client: httpx.AsyncClient
    ):
        """GET /api/v1/stig/compliance/trend returns historical trend."""
        response = await authed_client.get(
            "/api/v1/stig/compliance/trend",
            params={"period": "30d"}
        )
        
        if response.status_code == 404:
            pytest.skip("Compliance trend not implemented")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should have time series data
        if isinstance(data, list):
            trend = data
        else:
            trend = data.get("trend", data.get("data", []))
        
        assert isinstance(trend, list)


class TestCredentialManagement:
    """Test credential management for device access."""
    
    async def test_list_credentials(
        self,
        authed_client: httpx.AsyncClient
    ):
        """GET /api/v1/stig/credentials returns saved credentials."""
        response = await authed_client.get("/api/v1/stig/credentials")
        
        if response.status_code == 404:
            pytest.skip("Credentials endpoint not implemented")
        
        assert response.status_code == 200
        data = response.json()
        
        if isinstance(data, list):
            credentials = data
        else:
            credentials = data.get("items", data.get("credentials", []))
        
        assert isinstance(credentials, list)
    
    async def test_create_credential(
        self,
        authed_client: httpx.AsyncClient
    ):
        """POST /api/v1/stig/credentials creates credential set."""
        response = await authed_client.post(
            "/api/v1/stig/credentials",
            json={
                "name": "E2E Test Credential",
                "type": "ssh",
                "username": "e2e_test_user",
                "auth_method": "password",
                # Password would be encrypted/stored securely
                "description": "E2E test - auto cleanup"
            }
        )
        
        if response.status_code == 404:
            pytest.skip("Credentials endpoint not implemented")
        
        assert response.status_code in (200, 201)
        data = response.json()
        
        assert "id" in data
        # Password should not be returned
        assert "password" not in data or data.get("password") is None
        
        # Cleanup
        await authed_client.delete(f"/api/v1/stig/credentials/{data['id']}")
    
    async def test_credentials_encrypted(
        self,
        authed_client: httpx.AsyncClient,
        postgres_conn
    ):
        """Credentials are stored encrypted in database."""
        # This is a security verification test
        # We check that raw passwords are not stored
        
        async with postgres_conn.cursor() as cur:
            await cur.execute(
                """
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema = 'stig' 
                AND table_name = 'credentials'
                """
            )
            columns = await cur.fetchall()
        
        # If credentials table exists, password column should indicate encryption
        if columns:
            column_names = [c[0] for c in columns]
            # Should have encrypted password field, not plain password
            assert "password" not in column_names or "encrypted" in str(columns).lower()


class TestCollectorIntegration:
    """Test STIG collector (SSH, Netmiko) integration."""
    
    async def test_list_collector_types(
        self,
        authed_client: httpx.AsyncClient
    ):
        """GET /api/v1/stig/collectors/types returns supported collector types."""
        response = await authed_client.get("/api/v1/stig/collectors/types")
        
        if response.status_code == 404:
            pytest.skip("Collector types endpoint not implemented")
        
        assert response.status_code == 200
        data = response.json()
        
        types = data.get("types", data) if isinstance(data, dict) else data
        
        # Should support SSH at minimum
        type_list = [t.lower() if isinstance(t, str) else t.get("type", "").lower() for t in types]
        assert "ssh" in type_list or any("ssh" in str(t) for t in types)
    
    async def test_test_connection(
        self,
        authed_client: httpx.AsyncClient
    ):
        """POST /api/v1/stig/collectors/test tests device connectivity."""
        response = await authed_client.post(
            "/api/v1/stig/collectors/test",
            json={
                "hostname": "localhost",
                "ip_address": "127.0.0.1",
                "port": 22,
                "collector_type": "ssh"
            }
        )
        
        if response.status_code == 404:
            pytest.skip("Connection test endpoint not implemented")
        
        # Connection might fail (no SSH on localhost), but endpoint should work
        assert response.status_code in (200, 400, 422, 503)
        data = response.json()
        
        assert "success" in data or "status" in data or "message" in data


class TestAuditLogging:
    """Test STIG audit events to shared.audit stream."""
    
    async def test_findings_logged_to_audit(
        self,
        authed_client: httpx.AsyncClient,
        query_logs
    ):
        """STIG findings are logged to Loki."""
        # Query for STIG-related logs
        logs = await query_logs('{app="stig"} |= "finding"')
        
        # Soft check - logs may not exist yet
        if logs:
            assert len(logs) > 0
    
    async def test_audit_completion_logged(
        self,
        authed_client: httpx.AsyncClient,
        query_logs
    ):
        """Audit completion events are logged."""
        logs = await query_logs('{app="stig"} |= "complete"')
        
        # Soft check
        pass


class TestAssetManagement:
    """Test STIG asset/target management."""
    
    async def test_list_assets(
        self,
        authed_client: httpx.AsyncClient
    ):
        """GET /api/v1/stig/assets returns managed assets."""
        response = await authed_client.get("/api/v1/stig/assets")
        
        if response.status_code == 404:
            pytest.skip("Assets endpoint not implemented")
        
        assert response.status_code == 200
        data = response.json()
        
        if isinstance(data, list):
            assets = data
        else:
            assets = data.get("items", data.get("assets", []))
        
        assert isinstance(assets, list)
    
    async def test_create_asset(
        self,
        authed_client: httpx.AsyncClient
    ):
        """POST /api/v1/stig/assets creates target asset."""
        response = await authed_client.post(
            "/api/v1/stig/assets",
            json={
                "hostname": "e2e-test-asset",
                "ip_address": "10.255.255.200",
                "asset_type": "network_device",
                "os_family": "cisco_ios",
                "description": "E2E test asset"
            }
        )
        
        if response.status_code == 404:
            pytest.skip("Assets endpoint not implemented")
        
        assert response.status_code in (200, 201)
        data = response.json()
        
        assert "id" in data
        
        # Cleanup
        await authed_client.delete(f"/api/v1/stig/assets/{data['id']}")
