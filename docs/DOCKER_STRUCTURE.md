# GridWatch NetEnterprise - Docker Compose Structure

> Complete reference for the containerized architecture

**Version**: 0.2.0
**Last Updated**: 2026-01-08

---

## Quick Start

```bash
# Full stack (all services)
docker compose up -d

# Specific module stacks
docker compose --profile ipam up -d      # IPAM + infrastructure
docker compose --profile npm up -d       # NPM + infrastructure
docker compose --profile stig up -d      # STIG + infrastructure
docker compose --profile syslog up -d    # Syslog + infrastructure

# Infrastructure only (databases, messaging, observability)
docker compose --profile infra up -d

# Production mode (adds nginx reverse proxy)
docker compose --profile prod up -d

# View logs
docker compose logs -f [service-name]

# Stop all services
docker compose down

# Stop and remove volumes (fresh start)
docker compose down -v
```

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL ACCESS                                  │
│                                                                              │
│    Browser ──────► :3000 (Web UI)                                            │
│    API Clients ──► :3001 (Gateway)                                           │
│    Syslog ───────► :514  (UDP/TCP)                                           │
│    Grafana ──────► :3002 (Dashboards)                                        │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           APPLICATION LAYER                                   │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Web UI    │  │   Gateway   │  │Auth Service │  │   Nginx     │         │
│  │  (React)    │  │  (Fastify)  │  │  (Fastify)  │  │ (prod only) │         │
│  │   :3000     │  │    :3001    │  │    :3006    │  │  :80/:443   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘         │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           MODULE SERVICES                                     │
│                                                                              │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  │
│  │        IPAM         │  │         NPM         │  │        STIG         │  │
│  │  ┌───────────────┐  │  │  ┌───────────────┐  │  │  ┌───────────────┐  │  │
│  │  │ ipam-service  │  │  │  │ npm-service   │  │  │  │ stig-service  │  │  │
│  │  │    :3003      │  │  │  │    :3004      │  │  │  │    :3005      │  │  │
│  │  └───────────────┘  │  │  └───────────────┘  │  │  └───────────────┘  │  │
│  │  ┌───────────────┐  │  │  ┌───────────────┐  │  │  ┌───────────────┐  │  │
│  │  │ ipam-scanner  │  │  │  │ npm-collector │  │  │  │stig-collector │  │  │
│  │  │  (worker)     │  │  │  │ (SNMP poller) │  │  │  │ (SSH/Netmiko) │  │  │
│  │  └───────────────┘  │  │  └───────────────┘  │  │  └───────────────┘  │  │
│  │                     │  │  ┌───────────────┐  │  │  ┌───────────────┐  │  │
│  │                     │  │  │  npm-alerts   │  │  │  │ stig-reports  │  │  │
│  │                     │  │  │ (evaluator)   │  │  │  │  (CKL/PDF)    │  │  │
│  │                     │  │  └───────────────┘  │  │  └───────────────┘  │  │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                            SYSLOG                                        │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │ │
│  │  │ syslog-service  │  │syslog-collector │  │syslog-forwarder │          │ │
│  │  │     :3007       │  │   :514 UDP/TCP  │  │  (SIEM export)  │          │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         INFRASTRUCTURE LAYER                                  │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ PostgreSQL  │  │    Redis    │  │    NATS     │  │    Vault    │         │
│  │   :5433     │  │    :6379    │  │ :4222/:8222 │  │    :8200    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘         │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         OBSERVABILITY LAYER                                   │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │VictoriaMetr.│  │ Prometheus  │  │    Loki     │  │   Jaeger    │         │
│  │   :8428     │  │    :9090    │  │    :3100    │  │   :16686    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘         │
│  ┌─────────────┐  ┌─────────────┐                                           │
│  │   Grafana   │  │  Promtail   │                                           │
│  │    :3002    │  │  (shipper)  │                                           │
│  └─────────────┘  └─────────────┘                                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Service Profiles

Profiles allow selective service startup based on what you're working on.

| Profile  | Services Included                                                          | Use Case                    |
| -------- | -------------------------------------------------------------------------- | --------------------------- |
| `infra`  | postgres, redis, nats, vault, observability stack                          | Testing infrastructure only |
| `ipam`   | infra + gateway, auth, web-ui, ipam-service, ipam-scanner                  | IPAM development            |
| `npm`    | infra + gateway, auth, web-ui, npm-service, npm-collector, npm-alerts      | NPM development             |
| `stig`   | infra + gateway, auth, web-ui, stig-service, stig-collector, stig-reports  | STIG development            |
| `syslog` | postgres, redis, nats + syslog-service, syslog-collector, syslog-forwarder | Syslog development          |
| `prod`   | nginx reverse proxy                                                        | Production deployment       |
| _(none)_ | All services                                                               | Full stack testing          |

---

## Container Details

### Shared Infrastructure

| Container           | Image                | Port(s)    | Purpose             | Health Check     |
| ------------------- | -------------------- | ---------- | ------------------- | ---------------- |
| `gridwatch-postgres` | postgres:15-alpine   | 5433→5432  | Primary database    | `pg_isready`     |
| `gridwatch-redis`    | redis:7-alpine       | 6379       | Cache & sessions    | `redis-cli ping` |
| `gridwatch-nats`     | nats:2.10-alpine     | 4222, 8222 | JetStream messaging | HTTP /healthz    |
| `gridwatch-vault`    | hashicorp/vault:1.15 | 8200       | Secrets management  | `vault status`   |

### Observability Stack

| Container                  | Image                                    | Port(s)           | Purpose                     | Health Check     |
| -------------------------- | ---------------------------------------- | ----------------- | --------------------------- | ---------------- |
| `gridwatch-victoriametrics` | victoriametrics/victoria-metrics:v1.93.0 | 8428              | Time-series metrics storage | HTTP /health     |
| `gridwatch-prometheus`      | prom/prometheus:v2.48.0                  | 9090              | Metrics scraping            | HTTP /-/healthy  |
| `gridwatch-loki`            | grafana/loki:2.9.0                       | 3100              | Log aggregation             | HTTP /ready      |
| `gridwatch-promtail`        | grafana/promtail:2.9.0                   | -                 | Log shipping                | -                |
| `gridwatch-jaeger`          | jaegertracing/all-in-one:1.51            | 16686, 4317, 4318 | Distributed tracing         | HTTP /           |
| `gridwatch-grafana`         | grafana/grafana:10.2.0                   | 3002→3000         | Visualization dashboards    | HTTP /api/health |

### Application Services

| Container               | Build Context           | Port | Purpose                       | Health Check  |
| ----------------------- | ----------------------- | ---- | ----------------------------- | ------------- |
| `gridwatch-gateway`      | ./apps/gateway          | 3001 | Unified API gateway (Fastify) | HTTP /health  |
| `gridwatch-auth-service` | ./services/auth-service | 3006 | Authentication & RBAC         | HTTP /healthz |
| `gridwatch-web-ui`       | ./apps/web-ui           | 3000 | React frontend (Vite)         | -             |

### IPAM Services

| Container               | Build Target | Port | Purpose                | Special Capabilities   |
| ----------------------- | ------------ | ---- | ---------------------- | ---------------------- |
| `gridwatch-ipam-service` | development  | 3003 | FastAPI backend        | -                      |
| `gridwatch-ipam-scanner` | scanner      | -    | Network scanner worker | `NET_RAW`, `NET_ADMIN` |

### NPM Services

| Container                | Build Target | Port | Purpose                  |
| ------------------------ | ------------ | ---- | ------------------------ |
| `gridwatch-npm-service`   | development  | 3004 | FastAPI backend          |
| `gridwatch-npm-collector` | collector    | -    | SNMP polling worker      |
| `gridwatch-npm-alerts`    | alerts       | -    | Alert evaluation service |

### STIG Services

| Container                 | Build Target | Port | Purpose                  |
| ------------------------- | ------------ | ---- | ------------------------ |
| `gridwatch-stig-service`   | development  | 3005 | FastAPI backend          |
| `gridwatch-stig-collector` | collector    | -    | SSH/Netmiko audit worker |
| `gridwatch-stig-reports`   | reports      | -    | CKL/PDF report generator |

### Syslog Services

| Container                   | Build Target | Port(s)          | Purpose          | Special Capabilities |
| --------------------------- | ------------ | ---------------- | ---------------- | -------------------- |
| `gridwatch-syslog-service`   | development  | 3007             | FastAPI backend  | -                    |
| `gridwatch-syslog-collector` | collector    | 514/udp, 514/tcp | UDP/TCP listener | `NET_BIND_SERVICE`   |
| `gridwatch-syslog-forwarder` | forwarder    | -                | SIEM forwarding  | -                    |

### Production

| Container        | Image             | Port(s) | Purpose                         |
| ---------------- | ----------------- | ------- | ------------------------------- |
| `gridwatch-nginx` | nginx:1.25-alpine | 80, 443 | TLS termination & reverse proxy |

---

## Port Allocation Reference

| Port  | Service          | Protocol | Notes                       |
| ----- | ---------------- | -------- | --------------------------- |
| 80    | Nginx            | HTTP     | Production only             |
| 443   | Nginx            | HTTPS    | Production only             |
| 514   | Syslog Collector | UDP/TCP  | Privileged port             |
| 3000  | Web UI           | HTTP     | Vite dev server             |
| 3001  | API Gateway      | HTTP     | Main API entry point        |
| 3002  | Grafana          | HTTP     | Dashboards                  |
| 3003  | IPAM Service     | HTTP     | Internal API                |
| 3004  | NPM Service      | HTTP     | Internal API                |
| 3005  | STIG Service     | HTTP     | Internal API                |
| 3006  | Auth Service     | HTTP     | Internal API                |
| 3007  | Syslog Service   | HTTP     | Internal API                |
| 3100  | Loki             | HTTP     | Log ingestion               |
| 4222  | NATS             | TCP      | Client connections          |
| 4317  | Jaeger           | gRPC     | OTLP traces                 |
| 4318  | Jaeger           | HTTP     | OTLP traces                 |
| 5433  | PostgreSQL       | TCP      | Host-mapped (internal 5432) |
| 6379  | Redis            | TCP      | Cache/sessions              |
| 8200  | Vault            | HTTP     | Secrets API                 |
| 8222  | NATS             | HTTP     | Monitoring                  |
| 8428  | VictoriaMetrics  | HTTP     | Metrics API                 |
| 9090  | Prometheus       | HTTP     | Metrics UI                  |
| 16686 | Jaeger           | HTTP     | Tracing UI                  |

---

## Volumes

Named volumes for persistent data:

| Volume                          | Container                  | Mount Path               | Purpose               |
| ------------------------------- | -------------------------- | ------------------------ | --------------------- |
| `gridwatch-postgres-data`        | postgres                   | /var/lib/postgresql/data | Database files        |
| `gridwatch-redis-data`           | redis                      | /data                    | Redis AOF persistence |
| `gridwatch-nats-data`            | nats                       | /data                    | JetStream storage     |
| `gridwatch-victoriametrics-data` | victoriametrics            | /victoria-metrics-data   | Time-series data      |
| `gridwatch-prometheus-data`      | prometheus                 | /prometheus              | Metrics storage       |
| `gridwatch-loki-data`            | loki                       | /loki                    | Log storage           |
| `gridwatch-grafana-data`         | grafana                    | /var/lib/grafana         | Dashboards & config   |
| `gridwatch-stig-reports`         | stig-service, stig-reports | /app/output              | Generated reports     |

---

## Network Configuration

All services communicate on a single Docker bridge network:

```yaml
networks:
  gridwatch-network:
    name: gridwatch-network
    driver: bridge
    ipam:
      config:
        - subnet: 172.30.0.0/16
```

### Internal DNS

Services communicate via container names:

- `postgres:5432` (not localhost:5433)
- `redis:6379`
- `nats:4222`
- `vault:8200`
- `auth-service:3006`

---

## Multi-Stage Dockerfile Targets

Each application Dockerfile supports multiple build targets:

### apps/ipam/Dockerfile

```dockerfile
# Target: development - Full FastAPI app with hot reload
# Target: scanner - Network scanning worker only
```

### apps/npm/Dockerfile

```dockerfile
# Target: development - Full FastAPI app with hot reload
# Target: collector - SNMP polling worker only
# Target: alerts - Alert evaluation service only
```

### apps/stig/Dockerfile

```dockerfile
# Target: development - Full FastAPI app with hot reload
# Target: collector - SSH/Netmiko audit worker only
# Target: reports - CKL/PDF generation service only
```

### apps/syslog/Dockerfile

```dockerfile
# Target: development - Full FastAPI app with hot reload
# Target: collector - UDP/TCP syslog listener only
# Target: forwarder - SIEM forwarding service only
```

---

## Health Check Configuration

All services use consistent health check defaults:

```yaml
healthcheck:
  interval: 30s # Check every 30 seconds
  timeout: 10s # Wait 10 seconds for response
  retries: 3 # Mark unhealthy after 3 failures
  start_period: 40s # Grace period for startup
```

---

## Dependency Chain

Services start in order based on health check dependencies:

```
postgres ─────┬──► redis ──────┬──► nats ──────┬──► vault
              │                │               │
              ▼                ▼               ▼
         auth-service ────────────────────► gateway
                                               │
              ┌────────────────┬───────────────┼───────────────┬────────────────┐
              ▼                ▼               ▼               ▼                ▼
         ipam-service     npm-service    stig-service   syslog-service      web-ui
              │                │               │               │
              ▼                ├───────┐       ├───────┐       ├───────┐
         ipam-scanner    npm-collector  stig-collector  syslog-collector
                              │               │               │
                         npm-alerts     stig-reports   syslog-forwarder
```

---

## Environment Variables

Required variables (from `.env` file):

```bash
# Database
POSTGRES_USER=gridwatch
POSTGRES_PASSWORD=<required>
POSTGRES_DB=gridwatch

# Redis
REDIS_PASSWORD=<required>

# Vault
VAULT_DEV_TOKEN=gridwatch-dev-token

# JWT
JWT_SECRET=<required>

# Grafana
GRAFANA_USER=admin
GRAFANA_PASSWORD=<required>
GRAFANA_PORT=3002
```

See `.env.example` for complete list with defaults.

---

## Special Container Capabilities

Some containers require elevated Linux capabilities:

| Container          | Capabilities           | Reason                                            |
| ------------------ | ---------------------- | ------------------------------------------------- |
| `ipam-scanner`     | `NET_RAW`, `NET_ADMIN` | ICMP ping, raw socket access for network scanning |
| `syslog-collector` | `NET_BIND_SERVICE`     | Bind to privileged port 514                       |

---

## Logging Configuration

All containers use consistent JSON logging:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m" # Rotate at 10MB
    max-file: "3" # Keep 3 rotated files
```

Logs are shipped to Loki via Promtail for centralized viewing in Grafana.

---

## Development Workflow

### Hot Reload

Source directories are mounted read-only for development:

```yaml
volumes:
  - ./apps/gateway/src:/app/src:ro
  - ./packages:/packages
```

Changes to source files trigger automatic reload in development mode.

### Debugging

```bash
# View container logs
docker compose logs -f gateway

# Shell into container
docker exec -it gridwatch-gateway sh

# Check health status
docker compose ps

# Restart specific service
docker compose restart gateway
```

### Clean Restart

```bash
# Stop all containers
docker compose down

# Remove volumes (database reset)
docker compose down -v

# Rebuild specific service
docker compose build --no-cache gateway

# Full rebuild and start
docker compose up -d --build
```

---

## Platform-Specific Notes

### macOS

- Docker Desktop required
- Use `host.docker.internal` to access host from containers
- Grafana on port 3002 (avoids Vite conflict on 3000)

### RHEL 9.x

- Podman compatible (`podman-compose`)
- Use `:Z` suffix for bind mounts with SELinux
- Open firewall ports: `firewall-cmd --add-port=3000-3007/tcp --permanent`

### Windows

- Docker Desktop with WSL2 backend required
- Use Linux containers (not Windows containers)
- Git: `core.autocrlf=input` for LF line endings

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker compose logs [service-name]

# Verify dependencies are healthy
docker compose ps

# Check port conflicts
lsof -i :3001
```

### Database connection issues

```bash
# Verify PostgreSQL is healthy
docker exec gridwatch-postgres pg_isready

# Check connection string
docker exec gridwatch-gateway env | grep POSTGRES
```

### Port already in use

```bash
# Find process using port
lsof -i :3000

# Kill process or change port in .env
GRAFANA_PORT=3002
```

### Reset everything

```bash
docker compose down -v
docker system prune -af
docker compose up -d --build
```
