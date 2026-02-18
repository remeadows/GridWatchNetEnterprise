# CLAUDE.md - GridWatch NetEnterprise

## Project Overview

GridWatch NetEnterprise is a unified network management platform combining three applications:

- **GridWatch IPAM** - IP Address Management
- **GridWatch NPM** - Network Performance Monitoring
- **GridWatch STIG Manager** - Security Technical Implementation Guide compliance

Target deployment platforms: macOS, Red Hat Enterprise Linux 9.x, Windows 11/Server

## Architecture Principles

### Security-First Approach

- All secrets managed via HashiCorp Vault
- JWT authentication with Argon2id password hashing
- Role-based access control (Admin/Operator/Viewer)
- All internal service communication over TLS
- Container images scanned with Trivy before deployment

### Technology Standards (Verified 2026-02-13)

- **API Gateway**: Node.js 20+ / Fastify 5.2 / TypeScript 5.3+
- **Frontend**: React 18 / TypeScript / Tailwind CSS 3.4 / Vite 7.3
- **Python Services**: Python 3.13+ with AsyncIO
- **Database**: PostgreSQL 15+ (primary), VictoriaMetrics (time-series), Redis 7+ (cache)
- **Messaging**: NATS 2.10 with JetStream
- **Observability**: Grafana 11.4 / Prometheus 2.48 / Loki 2.9 / Jaeger 1.51

## Repository Structure

```
gridwatch-net-enterprise/
├── infrastructure/     # Docker configs, scripts, observability
├── packages/          # Shared TypeScript libraries (npm workspaces)
├── services/          # Shared Python microservices
├── apps/
│   ├── gateway/       # Unified Fastify API gateway
│   ├── ipam/          # IPAM Python backend services
│   ├── npm/           # NPM Python backend services
│   ├── stig/          # STIG Manager Python backend services
│   └── web-ui/        # Unified React frontend
└── .github/workflows/ # CI/CD pipelines
```

## Development Commands

### Environment Setup

```bash
# Start all services in development mode
docker compose up -d

# Start specific application stack
docker compose --profile ipam up -d
docker compose --profile npm up -d
docker compose --profile stig up -d

# View logs
docker compose logs -f [service-name]
```

### TypeScript/Node.js (from repo root)

```bash
npm install                    # Install all workspace dependencies
npm run dev -w apps/gateway    # Run gateway in dev mode
npm run dev -w apps/web-ui     # Run frontend in dev mode
npm run build                  # Build all packages
npm run lint                   # Lint all TypeScript
npm run test                   # Run Jest tests
```

### Python (from repo root)

```bash
poetry install                 # Install all Python dependencies
poetry run pytest              # Run all Python tests
poetry run black .             # Format Python code
poetry run ruff check .        # Lint Python code
```

### Database Migrations

```bash
# From apps/gateway or relevant service
npm run db:migrate             # Run pending migrations
npm run db:rollback            # Rollback last migration
npm run db:seed                # Seed development data
```

## Code Conventions

### TypeScript

- Use strict TypeScript with no `any` types
- Prefer `interface` over `type` for object shapes
- Use Zod for runtime validation at API boundaries
- Follow Fastify plugin pattern for route organization

### Python

- Type hints required on all function signatures
- Use Pydantic for data validation
- AsyncIO for all I/O operations
- Follow src layout: `apps/{app}/src/{module}/`

### Docker

- Multi-stage builds for production images
- Non-root user in all containers
- Health checks defined for all services
- Pin all image versions (no `latest` tags)

### Git Workflow

- Branch naming: `feature/`, `fix/`, `refactor/`
- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`
- All PRs require passing CI and security scan

## Database Schema Namespaces

PostgreSQL uses schemas to separate application data:

- `ipam.*` - IP address management tables
- `npm.*` - Network performance monitoring tables
- `stig.*` - STIG compliance tables
- `shared.*` - Cross-application tables (users, audit_logs, etc.)

## NATS JetStream Subjects

| Subject Pattern    | Publisher         | Subscribers             |
| ------------------ | ----------------- | ----------------------- |
| `ipam.discovery.*` | IPAM Collectors   | IPAM Processing         |
| `npm.metrics.*`    | NPM Collectors    | VictoriaMetrics, Alerts |
| `stig.audit.*`     | STIG Collectors   | Reports, Alerts         |
| `shared.alerts.*`  | All alert engines | Notification Service    |
| `shared.audit.*`   | All services      | Audit Service           |

## Environment Variables

Required environment variables (see `.env.example`):

- `POSTGRES_*` - Database connection
- `REDIS_URL` - Redis connection string
- `NATS_URL` - NATS server URL
- `VAULT_ADDR` / `VAULT_TOKEN` - Vault configuration
- `JWT_SECRET` - JWT signing key (prefer Vault in production)

## Testing Strategy

- **Unit Tests**: Jest (TypeScript), pytest (Python)
- **Integration Tests**: Testcontainers for database/Redis/NATS
- **E2E Tests**: Playwright against docker-compose environment
- **Security Tests**: Trivy container scanning, npm audit, safety (Python)

## Working with This Codebase

### Adding a New API Endpoint

1. Define Zod schema in `packages/shared-types/`
2. Add route handler in `apps/gateway/src/routes/{app}/`
3. Add corresponding service logic in `apps/{app}/`
4. Update OpenAPI documentation

### Adding a New Collector

1. Create collector module in `apps/{app}/collectors/`
2. Define NATS subject in `infrastructure/nats/`
3. Add processing handler for the subject
4. Update docker-compose with collector service

### Modifying Shared Components

1. Update component in `packages/shared-ui/`
2. Run `npm run build -w packages/shared-ui`
3. Test in `apps/web-ui/` with `npm run dev`

## Cross-Platform Notes

### macOS

- Docker Desktop required
- Use `host.docker.internal` for host access

### RHEL 9.x

- Podman compatible (use `podman-compose`)
- SELinux: use `:Z` suffix for bind mounts

### Windows 11/Server

- Docker Desktop with WSL2 backend
- Use Linux containers (not Windows containers)
- Line endings: ensure Git uses LF (`core.autocrlf=input`)

## Security Checklist

Before any release:

- [ ] All container images scanned with Trivy (no HIGH/CRITICAL)
- [ ] Dependencies audited (`npm audit`, `safety check`)
- [ ] Secrets rotated in Vault
- [ ] RBAC permissions reviewed
- [ ] TLS certificates valid
- [ ] Backup/restore tested
