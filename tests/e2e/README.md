# GridWatch NetEnterprise - E2E Test Suite

Comprehensive end-to-end test suite for validating GridWatch NetEnterprise after Phases 1-7 completion.

## Overview

This test suite validates:

- **Infrastructure Health**: Docker containers, PostgreSQL, Redis, NATS, Vault, VictoriaMetrics
- **Authentication (Phase 2)**: JWT tokens, RBAC, session management
- **API Gateway (Phase 3)**: Routing, rate limiting, OpenAPI docs
- **IPAM Module (Phase 5)**: Subnet/address CRUD, discovery scanning, metrics
- **NPM Module (Phase 6)**: Collectors, device polling, alerts, dashboards
- **STIG Module (Phase 7)**: Benchmarks, audits, CKL/PDF reports, compliance
- **Cross-Module Integration**: Unified logging, shared auth, tracing
- **Frontend Validation**: Login, navigation, theme, session management

## Quick Start

```bash
# Run full test suite
./run_tests.sh

# Quick smoke test (infrastructure + auth only)
./run_tests.sh --quick

# Run specific module tests
./run_tests.sh --module ipam
./run_tests.sh --module npm
./run_tests.sh --module stig

# Run API tests only
./run_tests.sh --api

# Run frontend tests only
./run_tests.sh --frontend
```

## Directory Structure

```
tests/
├── e2e/                      # This directory
│   ├── run_tests.sh          # Main test runner
│   ├── requirements.txt      # Python dependencies
│   ├── pytest.ini            # Pytest configuration
│   ├── conftest.py           # Shared fixtures
│   ├── test_01_authentication.py
│   ├── test_02_gateway.py
│   ├── test_03_ipam.py
│   ├── test_04_npm.py
│   ├── test_05_stig.py
│   ├── test_06_integration.py
│   ├── test_frontend.py      # Playwright tests
│   └── reports/              # Test reports (generated)
├── infrastructure/           # Infrastructure health checks
│   ├── preflight.sh
│   ├── preflight.ps1
│   └── run-preflight.cmd
└── smoke/                    # Platform smoke tests
    ├── macos-arm64-smoke-test.sh
    ├── windows-smoke-test.ps1
    └── results/
```

## Prerequisites

### System Requirements

- Python 3.10+
- Docker and Docker Compose
- Node.js 18+ (for Playwright)
- PostgreSQL client tools (`psql`)
- Redis CLI (`redis-cli`)
- Network access to localhost ports

### Environment Variables

```bash
# API Gateway
export GATEWAY_URL=http://localhost:3000

# PostgreSQL
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=gridwatch
export POSTGRES_USER=gridwatch
export POSTGRES_PASSWORD=gridwatch

# Redis
export REDIS_HOST=localhost
export REDIS_PORT=6379

# NATS
export NATS_HOST=localhost
export NATS_PORT=4222

# VictoriaMetrics
export VICTORIA_HOST=localhost
export VICTORIA_PORT=8428

# Vault (optional)
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=your-token
```

## Test Categories

### Infrastructure Pre-flight (`infrastructure/preflight.sh`)

Shell script that validates all infrastructure services before running tests:

- Docker container states
- PostgreSQL schemas (ipam._, npm._, stig._, shared._)
- Redis connectivity and session operations
- NATS JetStream streams
- Vault health and seal status
- VictoriaMetrics read/write
- Observability stack (Grafana, Loki, Jaeger)

### API Tests (`api/tests/`)

| File                        | Markers                    | Phase | Description                               |
| --------------------------- | -------------------------- | ----- | ----------------------------------------- |
| `test_01_authentication.py` | `@pytest.mark.auth`        | 2     | JWT login, RBAC, session, refresh, logout |
| `test_02_gateway.py`        | `@pytest.mark.gateway`     | 3     | Route structure, rate limiting, OpenAPI   |
| `test_03_ipam.py`           | `@pytest.mark.ipam`        | 5     | Subnet CRUD, discovery, metrics           |
| `test_04_npm.py`            | `@pytest.mark.npm`         | 6     | Collectors, polling, alerts, dashboards   |
| `test_05_stig.py`           | `@pytest.mark.stig`        | 7     | Benchmarks, audits, reports               |
| `test_06_integration.py`    | `@pytest.mark.integration` | All   | Cross-module validation                   |

### Frontend Tests (`frontend/tests/`)

Playwright tests for UI validation:

- Login flow
- Dashboard rendering
- Module navigation (SPA routing)
- Theme persistence
- Session management
- Responsive design
- Basic accessibility

## Running Tests

### Full Suite

```bash
./run_tests.sh
```

### By Phase/Module

```bash
# Authentication only
./run_tests.sh --api && cd api && pytest -m auth

# Gateway only
./run_tests.sh --api && pytest -m gateway

# IPAM module
./run_tests.sh --module ipam

# NPM module
./run_tests.sh --module npm

# STIG module
./run_tests.sh --module stig

# Integration tests
pytest -m integration
```

### Parallel Execution

```bash
./run_tests.sh --parallel
```

### Verbose Output

```bash
./run_tests.sh --verbose
```

### Manual pytest Usage

```bash
# Activate virtual environment
source .venv/bin/activate

# Run specific test file
pytest api/tests/test_03_ipam.py -v

# Run specific test class
pytest api/tests/test_03_ipam.py::TestSubnetCRUD -v

# Run specific test
pytest api/tests/test_03_ipam.py::TestSubnetCRUD::test_create_subnet -v

# Run with specific markers
pytest -m "ipam and not slow" -v

# Generate HTML report
pytest --html=reports/custom-report.html --self-contained-html
```

## Test Fixtures

### Session Fixtures

- `config`: Test configuration dataclass
- `http_client`: Async HTTP client (httpx)
- `redis_client`: Redis connection
- `postgres_conn`: PostgreSQL async connection
- `nats_client`: NATS connection
- `jetstream`: JetStream context

### Authentication Fixtures

- `admin_tokens`: Admin JWT tokens
- `operator_tokens`: Operator JWT tokens
- `viewer_tokens`: Viewer JWT tokens
- `authed_client`: HTTP client with admin auth headers

### Data Fixtures

- `test_subnet`: Auto-created/cleaned test subnet
- `test_device`: Auto-created/cleaned test device

### Utility Fixtures

- `nats_message_capture`: Capture NATS messages on subjects
- `query_metrics`: Query VictoriaMetrics
- `query_logs`: Query Loki logs

## Test Data

Tests use isolated test data that is automatically cleaned up:

- Test subnet: `10.255.0.0/24`
- Test users: `e2e_admin`, `e2e_operator`, `e2e_viewer`

**Important**: These test users must be created in the database before running tests.

```sql
-- Create test users (run once)
INSERT INTO shared.users (username, password_hash, role, email) VALUES
  ('e2e_admin', '$argon2id$...', 'Admin', 'e2e_admin@test.local'),
  ('e2e_operator', '$argon2id$...', 'Operator', 'e2e_operator@test.local'),
  ('e2e_viewer', '$argon2id$...', 'Viewer', 'e2e_viewer@test.local');
```

## Reports

Test reports are generated in `reports/`:

- `api-report-YYYYMMDD_HHMMSS.html` - API test results
- `frontend-report-YYYYMMDD_HHMMSS.html` - Frontend test results
- `summary-YYYYMMDD_HHMMSS.txt` - Overall summary

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start services
        run: docker compose up -d

      - name: Wait for services
        run: sleep 30

      - name: Run E2E tests
        run: ./run_tests.sh

      - name: Upload reports
        uses: actions/upload-artifact@v4
        with:
          name: test-reports
          path: reports/
```

## Troubleshooting

### Common Issues

**Infrastructure checks fail:**

```bash
# Check Docker containers
docker compose ps

# Check specific service logs
docker compose logs postgres
docker compose logs nats
```

**Authentication tests fail:**

```bash
# Verify test users exist
psql -h localhost -U gridwatch -d gridwatch -c "SELECT username, role FROM shared.users WHERE username LIKE 'e2e_%'"

# Check auth service logs
docker compose logs auth-service
```

**NATS message capture timeout:**

- NATS streams may not be configured
- Events may fire before subscription is established
- Increase timeout in `nats_message_capture` fixture

**Frontend tests fail:**

```bash
# Install Playwright browsers
playwright install chromium --with-deps

# Run with headed mode for debugging
pytest frontend/tests/ --headed
```

### Debug Mode

```bash
# Run single test with full output
pytest api/tests/test_03_ipam.py::TestSubnetCRUD::test_create_subnet -v -s --tb=long

# Drop into debugger on failure
pytest --pdb
```

## Contributing

When adding new tests:

1. Follow existing naming conventions (`test_<action>_<expected_result>`)
2. Add appropriate markers (`@pytest.mark.<module>`)
3. Use fixtures for setup/teardown
4. Include both positive and negative test cases
5. Mark slow tests with `@pytest.mark.slow`
6. Add soft checks for optional features with `pytest.skip()`

## License

Internal use only - GridWatch NetEnterprise
