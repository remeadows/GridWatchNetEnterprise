# NetNynja Enterprise

> Unified Network Management Platform combining IPAM, NPM, and STIG Manager

[![License](https://img.shields.io/badge/license-proprietary-blue.svg)]()
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)]()
[![Python](https://img.shields.io/badge/python-%3E%3D3.11-blue.svg)]()
[![Docker](https://img.shields.io/badge/docker-%3E%3D24.0-blue.svg)]()

## Overview

NetNynja Enterprise consolidates four network management applications into a unified platform:

- **NetNynja IPAM** - IP Address Management with network scanning, discovery, and fingerprinting
- **NetNynja NPM** - Network Performance Monitoring with SNMPv3, device discovery, and 3000+ device scale
- **NetNynja STIG Manager** - Security Technical Implementation Guide compliance auditing with 16+ platforms
- **NetNynja Syslog** - Centralized syslog collection with 10GB buffer and SIEM forwarding

### Supported Platforms

| Platform                     | Status       | Installation Guide                                 |
| ---------------------------- | ------------ | -------------------------------------------------- |
| macOS (Intel/Apple Silicon)  | ✅ Supported | [docs/INSTALL_MACOS.md](docs/INSTALL_MACOS.md)     |
| Red Hat Enterprise Linux 9.x | ✅ Supported | [docs/INSTALL_RHEL.md](docs/INSTALL_RHEL.md)       |
| Windows 11                   | ✅ Supported | [docs/INSTALL_WINDOWS.md](docs/INSTALL_WINDOWS.md) |
| Windows Server 2022          | ✅ Supported | [docs/INSTALL_WINDOWS.md](docs/INSTALL_WINDOWS.md) |

## Quick Start

### Prerequisites

| Component | Version | Notes                  |
| --------- | ------- | ---------------------- |
| Docker    | 24+     | With Docker Compose V2 |
| Node.js   | 20+     | For development        |
| Python    | 3.11+   | For development        |
| Poetry    | 1.7+    | Python package manager |

> See platform-specific installation guides above for detailed setup instructions.

### Container Requirements

The gateway container automatically includes **nmap 7.97+** for IPAM network scanning - no manual setup required.

**MAC Address Detection**: NMAP can only detect MAC addresses for hosts on the same Layer 2 network. Docker bridge networking limits this. For full fingerprinting, uncomment `network_mode: host` in `docker-compose.yml` for the gateway service.

### Start the Platform

```bash
# Clone and configure
git clone https://github.com/your-org/netnynja-enterprise.git
cd netnynja-enterprise
cp .env.example .env
# Edit .env with your passwords

# Install dependencies
npm install
poetry install

# Build and start
docker compose build
docker compose --profile ipam --profile npm --profile stig up -d

# Verify
docker compose ps
```

### Access Points

| Service         | URL                    | Credentials         |
| --------------- | ---------------------- | ------------------- |
| Web UI          | http://localhost:3000  | admin / (from .env) |
| API Gateway     | http://localhost:3001  | -                   |
| Grafana         | http://localhost:3002  | admin / (from .env) |
| NATS Monitoring | http://localhost:8322  | -                   |
| Jaeger Tracing  | http://localhost:16686 | -                   |
| Vault           | http://localhost:8300  | (dev token)         |

> **Note**: NATS (8322) and Vault (8300) use non-standard ports for Windows Hyper-V compatibility.

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
            ┌───────────────────────────────────────┼───────────────────────────────┐
            │                                       │                               │
    ┌───────▼───────┐                       ┌───────▼───────┐               ┌───────▼───────┐
    │  IPAM Module  │                       │  NPM Module   │               │  STIG Module  │
    │   (Python)    │                       │   (Python)    │               │   (Python)    │
    └───────┬───────┘                       └───────┬───────┘               └───────┬───────┘
            │                                       │                               │
            └───────────────────────────────────────┴───────────────────────────────┘
                                                    │
    ┌───────────────────────────────────────────────┼───────────────────────────────────────────┐
    │                                               │                                           │
┌───▼───────────┐   ┌───────────────┐   ┌───────────▼───────────┐   ┌───────────────┐   ┌───────▼───────┐
│  PostgreSQL   │   │     Redis     │   │     NATS JetStream    │   │    Vault      │   │VictoriaMetrics│
│  (Metadata)   │   │ (Cache/Sess)  │   │    (Message Bus)      │   │  (Secrets)    │   │ (Time-series) │
└───────────────┘   └───────────────┘   └───────────────────────┘   └───────────────┘   └───────────────┘
```

> See [docs/DOCKER_STRUCTURE.md](docs/DOCKER_STRUCTURE.md) for complete container architecture.

## Project Structure

```
netnynja-enterprise/
├── apps/
│   ├── gateway/          # Fastify API Gateway
│   ├── web-ui/           # React Frontend
│   ├── ipam/             # IPAM Python Services
│   ├── npm/              # NPM Python Services
│   ├── stig/             # STIG Python Services
│   └── syslog/           # Syslog Python Services
├── packages/
│   ├── shared-types/     # TypeScript type definitions
│   ├── shared-auth/      # Authentication library
│   └── shared-ui/        # React component library
├── services/
│   └── auth-service/     # Centralized auth
├── infrastructure/       # Docker configs, observability
├── docs/                 # Extended documentation
├── tests/                # E2E, infrastructure, smoke tests
└── docker-compose.yml
```

## Development

```bash
# Start specific module
docker compose --profile ipam up -d
docker compose --profile npm up -d
docker compose --profile stig up -d

# Run tests
npm run test                    # TypeScript tests
poetry run pytest               # Python tests

# Lint and format
npm run lint && npm run format
poetry run ruff check . && poetry run black .

# Type check
npm run typecheck
poetry run mypy .

# Validate workspaces
./scripts/validate-workspaces.sh
./scripts/validate-poetry.sh
```

## Features

### IPAM Module

- Network scanning (ICMP, TCP, NMAP)
- Host fingerprinting with OS detection
- Scan management and export (PDF/CSV)
- Add discovered hosts to NPM

### NPM Module

- SNMPv3 monitoring (FIPS-compliant)
- Device discovery and fingerprinting
- CPU, memory, latency metrics
- Scales to 3000+ devices

### STIG Module

- STIG Library management
- 16+ platform support
- CKL/PDF report generation
- Checklist import from STIG Viewer

### Syslog Module

- UDP/TCP on port 514
- RFC 3164/5424 parsing
- 10GB circular buffer
- SIEM forwarding (UDP/TCP/TLS)

## Security

- JWT + Argon2id authentication
- Role-based access control (Admin/Operator/Viewer)
- All secrets in HashiCorp Vault
- SNMPv3 credentials encrypted with AES-256-GCM
- Container image scanning with Trivy

## Documentation

| Document                                             | Description                     |
| ---------------------------------------------------- | ------------------------------- |
| [CLAUDE.md](CLAUDE.md)                               | AI-assisted development guide   |
| [CONTEXT.md](CONTEXT.md)                             | Architecture and domain context |
| [PROJECT_STATUS.md](PROJECT_STATUS.md)               | Current status and milestones   |
| [docs/DOCKER_STRUCTURE.md](docs/DOCKER_STRUCTURE.md) | Container architecture          |
| [docs/SESSION_HISTORY.md](docs/SESSION_HISTORY.md)   | Development session logs        |

## Contributing

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Follow code conventions in [CLAUDE.md](CLAUDE.md)
3. Run tests: `npm run test && npm run lint`
4. Commit with conventional commits: `git commit -m "feat: add feature"`
5. Push and create a pull request

## License

Proprietary - All rights reserved.

---

Built with care by the NetNynja Team
