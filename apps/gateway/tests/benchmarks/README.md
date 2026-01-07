# NetNynja Enterprise - Performance Benchmarks

This directory contains performance benchmarks for the API Gateway using [autocannon](https://github.com/mcollina/autocannon), a high-performance HTTP benchmarking tool.

## Prerequisites

- Node.js 20+
- Gateway running on localhost:3001 (or set `GATEWAY_URL` environment variable)
- PostgreSQL and Redis services available
- Test user credentials seeded in database

## Benchmark Suites

### Health Benchmarks (`health.benchmark.js`)

Tests the health check endpoints that are critical for container orchestration:

- `/healthz` - General health check
- `/livez` - Liveness probe
- `/readyz` - Readiness probe with dependency checks

### Auth Benchmarks (`auth.benchmark.js`)

Tests authentication endpoints:

- `/api/v1/auth/login` - User login with credentials
- `/api/v1/auth/profile` - Get user profile (requires auth)
- `/api/v1/auth/refresh` - Refresh access token

### IPAM Benchmarks (`ipam.benchmark.js`)

Tests IPAM API endpoints:

- `/api/v1/ipam/networks` - List networks
- `/api/v1/ipam/subnets` - List subnets
- `/api/v1/ipam/addresses` - List IP addresses
- `/api/v1/ipam/addresses/search` - Search IP addresses
- `/api/v1/ipam/devices` - List devices

## Running Benchmarks

```bash
# From the gateway directory (apps/gateway)

# Run all benchmark suites
npm run benchmark

# Run specific benchmark suite
npm run benchmark:health
npm run benchmark:auth
npm run benchmark:ipam

# Or run directly with node
node tests/benchmarks/run-all.js
node tests/benchmarks/health.benchmark.js

# Run all benchmarks with JSON output
node tests/benchmarks/run-all.js --json

# Run specific suite only
node tests/benchmarks/run-all.js --health-only
node tests/benchmarks/run-all.js --auth-only
node tests/benchmarks/run-all.js --ipam-only
```

## Performance Targets

### Health Endpoints

| Endpoint | Target RPS | P99 Latency | Duration | Connections |
| -------- | ---------- | ----------- | -------- | ----------- |
| /healthz | >= 10,000  | <= 100ms    | 10s      | 100         |
| /livez   | >= 10,000  | <= 100ms    | 10s      | 100         |
| /readyz  | >= 5,000   | <= 100ms    | 10s      | 50          |

### Auth Endpoints

| Endpoint             | Target RPS | P99 Latency | Duration | Connections |
| -------------------- | ---------- | ----------- | -------- | ----------- |
| /api/v1/auth/login   | >= 100     | <= 500ms    | 10s      | 10          |
| /api/v1/auth/profile | >= 2,000   | <= 50ms     | 10s      | 50          |
| /api/v1/auth/refresh | >= 500     | <= 100ms    | 10s      | 20          |

### IPAM Endpoints

| Endpoint                      | Target RPS | P99 Latency | Duration | Connections |
| ----------------------------- | ---------- | ----------- | -------- | ----------- |
| /api/v1/ipam/networks         | >= 1,000   | <= 100ms    | 10s      | 50          |
| /api/v1/ipam/subnets          | >= 1,000   | <= 100ms    | 10s      | 50          |
| /api/v1/ipam/addresses        | >= 500     | <= 200ms    | 10s      | 30          |
| /api/v1/ipam/addresses/search | >= 200     | <= 300ms    | 10s      | 20          |
| /api/v1/ipam/devices          | >= 1,000   | <= 100ms    | 10s      | 50          |

## Interpreting Results

- **Requests/sec (RPS)**: Higher is better. This is the throughput.
- **Latency (p99)**: Lower is better. 99% of requests complete within this time.
- **Errors**: Should be 0. Non-zero indicates server errors.
- **Timeouts**: Should be 0. Non-zero indicates request timeouts.
- **2xx responses**: Count of successful responses.
- **Non-2xx responses**: Should be 0 for health endpoints; auth/IPAM may have expected 4xx responses.

## Environment Variables

- `GATEWAY_URL` - Gateway base URL (default: `http://localhost:3001`)

## Benchmark Configuration

Each benchmark suite can be customized by editing the `BENCHMARK_CONFIG` object in the respective file:

```javascript
const BENCHMARK_CONFIG = {
  endpointName: {
    url: "/path",
    method: "GET",
    duration: 10, // seconds
    connections: 100, // concurrent connections
    pipelining: 10, // requests per connection
    target: {
      rps: 10000, // minimum required RPS
      p99: 10, // maximum P99 latency in ms
    },
  },
};
```

## CI Integration

Add to `.github/workflows/benchmark.yml`:

```yaml
name: Performance Benchmarks

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  benchmark:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
      redis:
        image: redis:7
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm run build -w apps/gateway
      - run: npm run start -w apps/gateway &
      - run: sleep 5
      - run: npm run benchmark -w apps/gateway
```

## Troubleshooting

### Gateway not available

```
❌ Error: Gateway not available at http://localhost:3001
```

Ensure the gateway is running: `npm run dev -w apps/gateway`

### Authentication failed

```
Authentication error: 401 Unauthorized
```

Ensure test user is seeded in database: `npm run db:seed`

### Low RPS values

- Check if database connections are saturated
- Verify Redis is running and accessible
- Review container resource limits
- Check for memory/CPU bottlenecks on host

### High latency

- Enable query caching in PostgreSQL
- Review slow query logs
- Check Redis cache hit rates
- Verify adequate connection pool sizes
