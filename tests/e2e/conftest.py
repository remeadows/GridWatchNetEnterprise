"""
GridWatch NetEnterprise E2E Tests - Shared Fixtures and Configuration
"""
import os
import json
import asyncio
from datetime import datetime, timedelta
from typing import Generator, AsyncGenerator, Any
from dataclasses import dataclass, field

import pytest
import pytest_asyncio
import httpx
import redis
import psycopg
import nats
from nats.js import JetStreamContext

# Configure pytest-asyncio to use session scope by default
pytest_plugins = ('pytest_asyncio',)


# =============================================================================
# Configuration
# =============================================================================

@dataclass
class TestConfig:
    """Central configuration for E2E tests."""
    gateway_url: str = field(default_factory=lambda: os.getenv("GATEWAY_URL", "http://localhost:3001"))
    postgres_host: str = field(default_factory=lambda: os.getenv("POSTGRES_HOST", "localhost"))
    postgres_port: int = field(default_factory=lambda: int(os.getenv("POSTGRES_PORT", "5433")))
    postgres_db: str = field(default_factory=lambda: os.getenv("POSTGRES_DB", "GridWatch"))
    postgres_user: str = field(default_factory=lambda: os.getenv("POSTGRES_USER", "GridWatch"))
    postgres_password: str = field(default_factory=lambda: os.getenv("POSTGRES_PASSWORD", "GridWatch-dev-2025"))
    redis_host: str = field(default_factory=lambda: os.getenv("REDIS_HOST", "localhost"))
    redis_port: int = field(default_factory=lambda: int(os.getenv("REDIS_PORT", "6379")))
    redis_password: str = field(default_factory=lambda: os.getenv("REDIS_PASSWORD", "redis-dev-2025"))
    nats_host: str = field(default_factory=lambda: os.getenv("NATS_HOST", "localhost"))
    nats_port: int = field(default_factory=lambda: int(os.getenv("NATS_PORT", "4222")))
    victoria_host: str = field(default_factory=lambda: os.getenv("VICTORIA_HOST", "localhost"))
    victoria_port: int = field(default_factory=lambda: int(os.getenv("VICTORIA_PORT", "8428")))
    loki_host: str = field(default_factory=lambda: os.getenv("LOKI_HOST", "localhost"))
    loki_port: int = field(default_factory=lambda: int(os.getenv("LOKI_PORT", "3100")))
    
    # Test credentials
    test_admin_user: str = "e2e_admin"
    test_admin_password: str = "E2EAdminPass123"
    test_operator_user: str = "e2e_operator"
    test_operator_password: str = "E2EOperatorPass123"
    test_viewer_user: str = "e2e_viewer"
    test_viewer_password: str = "E2EViewerPass123"
    
    # Test data
    test_subnet: str = "10.255.0.0/24"
    test_subnet_name: str = "E2E Test Subnet"
    
    @property
    def postgres_dsn(self) -> str:
        return f"postgresql://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
    
    @property
    def nats_url(self) -> str:
        return f"nats://{self.nats_host}:{self.nats_port}"
    
    @property
    def victoria_url(self) -> str:
        return f"http://{self.victoria_host}:{self.victoria_port}"
    
    @property
    def loki_url(self) -> str:
        return f"http://{self.loki_host}:{self.loki_port}"


@dataclass
class AuthTokens:
    """Container for authentication tokens."""
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int = 900  # 15 minutes
    
    @property
    def auth_header(self) -> dict[str, str]:
        return {"Authorization": f"{self.token_type} {self.access_token}"}


@dataclass
class TestResult:
    """Result of a single test with timing info."""
    name: str
    passed: bool
    duration_ms: float
    error: str | None = None
    details: dict[str, Any] = field(default_factory=dict)


# =============================================================================
# Session-Scoped Fixtures
# =============================================================================

@pytest.fixture(scope="session")
def config() -> TestConfig:
    """Provide test configuration."""
    return TestConfig()


@pytest_asyncio.fixture(scope="session")
async def http_client(config: TestConfig) -> AsyncGenerator[httpx.AsyncClient, None]:
    """Async HTTP client for API requests."""
    async with httpx.AsyncClient(
        base_url=config.gateway_url,
        timeout=30.0,
        follow_redirects=True
    ) as client:
        yield client


@pytest.fixture(scope="session")
def sync_http_client(config: TestConfig) -> Generator[httpx.Client, None, None]:
    """Sync HTTP client for simpler tests."""
    with httpx.Client(
        base_url=config.gateway_url,
        timeout=30.0,
        follow_redirects=True
    ) as client:
        yield client


@pytest.fixture(scope="session")
def redis_client(config: TestConfig) -> Generator[redis.Redis, None, None]:
    """Redis client for session verification."""
    client = redis.Redis(
        host=config.redis_host,
        port=config.redis_port,
        password=config.redis_password,
        decode_responses=True
    )
    yield client
    client.close()


@pytest_asyncio.fixture(scope="session")
async def postgres_conn(config: TestConfig) -> AsyncGenerator[psycopg.AsyncConnection, None]:
    """PostgreSQL connection for database verification."""
    conn = await psycopg.AsyncConnection.connect(config.postgres_dsn)
    yield conn
    await conn.close()


@pytest_asyncio.fixture(scope="session")
async def nats_client(config: TestConfig) -> AsyncGenerator[nats.NATS, None]:
    """NATS client for event verification."""
    nc = await nats.connect(config.nats_url)
    yield nc
    await nc.close()


@pytest_asyncio.fixture(scope="session")
async def jetstream(nats_client: nats.NATS) -> JetStreamContext:
    """JetStream context for stream operations."""
    return nats_client.jetstream()


# =============================================================================
# Authentication Fixtures
# =============================================================================

def extract_tokens(response_data: dict) -> dict:
    """Extract tokens from response, handling both flat and nested formats."""
    # Handle nested format: { success: true, data: { tokens: { accessToken, refreshToken } } }
    if "data" in response_data and "tokens" in response_data["data"]:
        tokens = response_data["data"]["tokens"]
        return {
            "access_token": tokens.get("accessToken", tokens.get("access_token")),
            "refresh_token": tokens.get("refreshToken", tokens.get("refresh_token")),
            "expires_in": tokens.get("expiresIn", tokens.get("expires_in", 900)),
        }
    # Handle flat format: { access_token, refresh_token, token_type, expires_in }
    return {
        "access_token": response_data.get("accessToken", response_data.get("access_token")),
        "refresh_token": response_data.get("refreshToken", response_data.get("refresh_token")),
        "expires_in": response_data.get("expiresIn", response_data.get("expires_in", 900)),
    }


@pytest_asyncio.fixture(scope="session")
async def admin_tokens(http_client: httpx.AsyncClient, config: TestConfig) -> AuthTokens:
    """Get admin authentication tokens."""
    response = await http_client.post(
        "/api/v1/auth/login",
        json={
            "username": config.test_admin_user,
            "password": config.test_admin_password
        }
    )
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    data = response.json()
    tokens = extract_tokens(data)
    return AuthTokens(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        token_type="Bearer",
        expires_in=tokens["expires_in"]
    )


@pytest_asyncio.fixture(scope="session")
async def operator_tokens(http_client: httpx.AsyncClient, config: TestConfig) -> AuthTokens:
    """Get operator authentication tokens."""
    response = await http_client.post(
        "/api/v1/auth/login",
        json={
            "username": config.test_operator_user,
            "password": config.test_operator_password
        }
    )
    assert response.status_code == 200, f"Operator login failed: {response.text}"
    data = response.json()
    tokens = extract_tokens(data)
    return AuthTokens(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"]
    )


@pytest_asyncio.fixture(scope="session")
async def viewer_tokens(http_client: httpx.AsyncClient, config: TestConfig) -> AuthTokens:
    """Get viewer authentication tokens."""
    response = await http_client.post(
        "/api/v1/auth/login",
        json={
            "username": config.test_viewer_user,
            "password": config.test_viewer_password
        }
    )
    assert response.status_code == 200, f"Viewer login failed: {response.text}"
    data = response.json()
    tokens = extract_tokens(data)
    return AuthTokens(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"]
    )


@pytest_asyncio.fixture
async def authed_client(
    http_client: httpx.AsyncClient,
    admin_tokens: AuthTokens
) -> AsyncGenerator[httpx.AsyncClient, None]:
    """HTTP client with admin authentication headers."""
    http_client.headers.update(admin_tokens.auth_header)
    yield http_client
    # Clean up header after test
    http_client.headers.pop("Authorization", None)


# =============================================================================
# Test Data Fixtures
# =============================================================================

@pytest_asyncio.fixture
async def test_network(
    authed_client: httpx.AsyncClient,
    config: TestConfig
) -> AsyncGenerator[dict[str, Any], None]:
    """Create and cleanup a test network."""
    # Create network
    response = await authed_client.post(
        "/api/v1/ipam/networks",
        json={
            "network": config.test_subnet,
            "name": config.test_subnet_name,
            "description": "E2E test network - auto cleanup",
            "vlanId": 999
        }
    )
    assert response.status_code in (200, 201), f"Failed to create test network: {response.text}"
    data = response.json()
    network = data.get("data", data)

    yield network

    # Cleanup
    await authed_client.delete(f"/api/v1/ipam/networks/{network['id']}")


@pytest_asyncio.fixture
async def test_device(
    authed_client: httpx.AsyncClient
) -> AsyncGenerator[dict[str, Any], None]:
    """Create and cleanup a test network device."""
    # Create device - API uses camelCase field names
    response = await authed_client.post(
        "/api/v1/npm/devices",
        json={
            "name": "e2e-test-device",
            "ipAddress": "10.255.255.1",
            "deviceType": "router",
            "vendor": "test",
            "snmpCommunity": "public",
            "snmpVersion": "2c",
            "enabled": False  # Don't actually poll during tests
        }
    )
    assert response.status_code in (200, 201), f"Failed to create test device: {response.text}"
    data = response.json()
    # Handle wrapped response
    device = data.get("data", data.get("device", data))

    yield device

    # Cleanup
    await authed_client.delete(f"/api/v1/npm/devices/{device['id']}")


# =============================================================================
# NATS Message Capture Fixtures
# =============================================================================

@pytest_asyncio.fixture
async def nats_message_capture(jetstream: JetStreamContext):
    """Factory fixture to capture NATS messages on a subject."""
    captured_messages = []
    subscriptions = []

    async def capture(subject: str, timeout: float = 5.0) -> list[dict]:
        """Subscribe and capture messages on a subject."""
        async def message_handler(msg):
            captured_messages.append({
                "subject": msg.subject,
                "data": json.loads(msg.data.decode()),
                "timestamp": datetime.utcnow().isoformat()
            })
            await msg.ack()

        # Create ephemeral consumer
        sub = await jetstream.subscribe(
            subject,
            cb=message_handler,
            durable=None,
            deliver_policy=nats.js.api.DeliverPolicy.NEW
        )
        subscriptions.append(sub)

        # Wait for messages
        await asyncio.sleep(timeout)
        return captured_messages

    yield capture

    # Cleanup subscriptions
    for sub in subscriptions:
        await sub.unsubscribe()


# =============================================================================
# Metrics Verification Fixtures
# =============================================================================

@pytest_asyncio.fixture
async def victoria_client(config: TestConfig) -> AsyncGenerator[httpx.AsyncClient, None]:
    """HTTP client for VictoriaMetrics queries."""
    async with httpx.AsyncClient(
        base_url=config.victoria_url,
        timeout=10.0
    ) as client:
        yield client


@pytest_asyncio.fixture
async def query_metrics(victoria_client: httpx.AsyncClient):
    """Factory fixture to query metrics from VictoriaMetrics."""
    async def query(promql: str, timeout: float = 5.0) -> dict[str, Any]:
        """Execute a PromQL query and return results."""
        response = await victoria_client.get(
            "/api/v1/query",
            params={"query": promql}
        )
        assert response.status_code == 200, f"Metrics query failed: {response.text}"
        return response.json()

    return query


# =============================================================================
# Logging Verification Fixtures
# =============================================================================

@pytest_asyncio.fixture
async def loki_client(config: TestConfig) -> AsyncGenerator[httpx.AsyncClient, None]:
    """HTTP client for Loki log queries."""
    async with httpx.AsyncClient(
        base_url=config.loki_url,
        timeout=10.0
    ) as client:
        yield client


@pytest_asyncio.fixture
async def query_logs(loki_client: httpx.AsyncClient):
    """Factory fixture to query logs from Loki."""
    async def query(
        logql: str,
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 100
    ) -> list[dict]:
        """Execute a LogQL query and return log entries."""
        if start is None:
            start = datetime.utcnow() - timedelta(minutes=5)
        if end is None:
            end = datetime.utcnow()

        response = await loki_client.get(
            "/loki/api/v1/query_range",
            params={
                "query": logql,
                "start": int(start.timestamp() * 1e9),
                "end": int(end.timestamp() * 1e9),
                "limit": limit
            }
        )
        assert response.status_code == 200, f"Log query failed: {response.text}"

        data = response.json()
        entries = []
        for stream in data.get("data", {}).get("result", []):
            for value in stream.get("values", []):
                entries.append({
                    "timestamp": value[0],
                    "line": value[1],
                    "labels": stream.get("stream", {})
                })
        return entries

    return query


# =============================================================================
# Test Reporting Hooks
# =============================================================================

def pytest_configure(config):
    """Configure custom markers and reporting."""
    # Ensure reports directory exists
    os.makedirs("reports", exist_ok=True)


def pytest_html_report_title(report):
    """Set custom HTML report title."""
    report.title = "GridWatch NetEnterprise E2E Test Report"


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """Capture timing information for each test."""
    outcome = yield
    report = outcome.get_result()
    
    if report.when == "call":
        # Add timing to report
        report.duration_ms = report.duration * 1000


def pytest_terminal_summary(terminalreporter, exitstatus, config):
    """Print custom summary at end of test run."""
    passed = len(terminalreporter.stats.get("passed", []))
    failed = len(terminalreporter.stats.get("failed", []))
    errors = len(terminalreporter.stats.get("error", []))
    
    terminalreporter.write_sep("=", "GridWatch E2E Test Summary")
    terminalreporter.write_line(f"Passed: {passed}")
    terminalreporter.write_line(f"Failed: {failed}")
    terminalreporter.write_line(f"Errors: {errors}")
    
    if failed > 0:
        terminalreporter.write_line("")
        terminalreporter.write_line("Failed tests require investigation before deployment.")
