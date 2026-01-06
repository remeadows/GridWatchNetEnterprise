# NetNynja Enterprise

> Unified Network Management Platform combining IPAM, NPM, and STIG Manager

[![License](https://img.shields.io/badge/license-proprietary-blue.svg)]()
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)]()
[![Python](https://img.shields.io/badge/python-%3E%3D3.11-blue.svg)]()
[![Docker](https://img.shields.io/badge/docker-%3E%3D24.0-blue.svg)]()

## Overview

NetNynja Enterprise consolidates three network management applications into a unified platform:

- **NetNynja IPAM** - IP Address Management with network scanning and discovery
- **NetNynja NPM** - Network Performance Monitoring with real-time metrics
- **NetNynja STIG Manager** - Security Technical Implementation Guide compliance auditing

### Supported Platforms

| Platform | Status |
|----------|--------|
| macOS (Intel/Apple Silicon) | ✅ Supported |
| Red Hat Enterprise Linux 9.x | ✅ Supported |
| Windows 11 | ✅ Supported |
| Windows Server 2022 | ✅ Supported |

## Quick Start

### Prerequisites

- Docker 24+ with Docker Compose V2
- Node.js 20+ (for development)
- Python 3.11+ (for development)
- Poetry (Python package manager)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/your-org/netnynja-enterprise.git
cd netnynja-enterprise

# Run the setup script
./infrastructure/scripts/init-dev.sh

# Or manually:
# 1. Copy environment file
cp .env.example .env
# Edit .env with your passwords

# 2. Start infrastructure
docker compose --profile infra up -d

# 3. Install dependencies
npm install
poetry install

# 4. Start development servers
npm run dev
```

### Access Points

| Service | URL | Credentials |
|---------|-----|-------------|
| Web UI | http://localhost:5173 | admin / (from .env) |
| API Gateway | http://localhost:3001 | - |
| Grafana | http://localhost:3000 | admin / (from .env) |
| NATS Monitoring | http://localhost:8222 | - |
| Jaeger Tracing | http://localhost:16686 | - |
| Vault | http://localhost:8200 | (dev token) |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Web Browser                              │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                      Nginx (Reverse Proxy)                       │
└─────────────────────────────┬───────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
┌───────▼───────┐                         ┌─────────▼─────────┐
│    Web UI     │                         │   API Gateway     │
│  (React/Vite) │                         │    (Fastify)      │
└───────────────┘                         └─────────┬─────────┘
                                                    │
                    ┌───────────────────────────────┼───────────────────────────────┐
                    │                               │                               │
            ┌───────▼───────┐               ┌───────▼───────┐               ┌───────▼───────┐
            │  IPAM Module  │               │  NPM Module   │               │  STIG Module  │
            │   (Python)    │               │   (Python)    │               │   (Python)    │
            └───────┬───────┘               └───────┬───────┘               └───────┬───────┘
                    │                               │                               │
                    └───────────────────────────────┴───────────────────────────────┘
                                                    │
        ┌───────────────────────────────────────────┼───────────────────────────────────────────┐
        │                                           │                                           │
┌───────▼───────┐   ┌───────────────┐   ┌───────────▼───────────┐   ┌───────────────┐   ┌───────▼───────┐
│  PostgreSQL   │   │     Redis     │   │     NATS JetStream    │   │    Vault      │   │VictoriaMetrics│
│  (Metadata)   │   │ (Cache/Sess)  │   │    (Message Bus)      │   │  (Secrets)    │   │ (Time-series) │
└───────────────┘   └───────────────┘   └───────────────────────┘   └───────────────┘   └───────────────┘
```

## Project Structure

```
netnynja-enterprise/
├── apps/
│   ├── gateway/          # Fastify API Gateway
│   ├── web-ui/           # React Frontend
│   ├── ipam/             # IPAM Python Services
│   ├── npm/              # NPM Python Services
│   └── stig/             # STIG Python Services
├── packages/
│   ├── shared-types/     # TypeScript type definitions
│   ├── shared-auth/      # Authentication library
│   └── shared-ui/        # React component library
├── services/
│   ├── auth-service/     # Centralized auth
│   ├── notification-service/
│   └── audit-service/
├── infrastructure/
│   ├── postgres/         # Database init
│   ├── nats/             # Message queue config
│   ├── prometheus/       # Metrics
│   ├── loki/             # Logging
│   ├── grafana/          # Dashboards
│   └── nginx/            # Reverse proxy
├── docker-compose.yml
├── package.json          # npm workspaces
├── pyproject.toml        # Poetry config
└── turbo.json            # Turborepo config
```

## Development

### Commands

```bash
# Start all services
docker compose up -d

# Start specific module
docker compose --profile ipam up -d
docker compose --profile npm up -d
docker compose --profile stig up -d

# Run tests
npm run test                    # TypeScript tests
poetry run pytest               # Python tests

# Lint code
npm run lint
poetry run ruff check .

# Format code
npm run format
poetry run black .

# Type check
npm run typecheck
poetry run mypy .
```

### Working with Claude Code

This project includes `CLAUDE.md` with comprehensive instructions for AI-assisted development. Key patterns:

- Always read CLAUDE.md first for context
- Follow the monorepo conventions
- Use the shared packages for common functionality
- Security-first approach for all changes

## Security

- JWT + Argon2id authentication
- Role-based access control (Admin/Operator/Viewer)
- All secrets in HashiCorp Vault
- TLS for production deployments
- Container image scanning with Trivy

## Contributing

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes following the code conventions
3. Run tests and linting: `npm run test && npm run lint`
4. Commit with conventional commits: `git commit -m "feat: add new feature"`
5. Push and create a pull request

## License

Proprietary - All rights reserved.

---

Built with ❤️ by the NetNynja Team
