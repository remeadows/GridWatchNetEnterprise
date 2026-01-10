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

| Platform                     | Status       |
| ---------------------------- | ------------ |
| macOS (Intel/Apple Silicon)  | ✅ Supported |
| Red Hat Enterprise Linux 9.x | ✅ Supported |
| Windows 11                   | ✅ Supported |
| Windows Server 2022          | ✅ Supported |

## Installation

### Prerequisites

| Component | Version | Notes                           |
| --------- | ------- | ------------------------------- |
| Docker    | 24+     | With Docker Compose V2          |
| Node.js   | 20+     | For development                 |
| Python    | 3.11+   | For development                 |
| Poetry    | 1.7+    | Python package manager          |
| Git       | 2.40+   | With LF line endings configured |

### Container Requirements

The gateway container automatically includes:

- **nmap 7.97+** - For IPAM network scanning and host discovery
- **nmap-scripts** - For enhanced NMAP functionality

These are pre-installed in the Docker image and require no manual setup.

#### MAC Address Detection (Fingerprinting)

**Important**: NMAP can only detect MAC addresses for hosts on the same Layer 2 network segment. By default, Docker containers run on a bridge network, which means they cannot see MAC addresses of hosts on your physical LAN.

**To enable MAC address detection**:

1. Edit `docker-compose.yml` and find the `gateway` service
2. Uncomment `network_mode: host`
3. Comment out the `networks:` and `ports:` sections for the gateway
4. Rebuild and restart: `docker compose up -d --build gateway`

**Note**: Host network mode is not supported on Docker Desktop for macOS/Windows. For full fingerprinting on these platforms, run the gateway natively (outside Docker) or use a Linux VM with host network access.

**Hostname Detection**: Hostnames are resolved via DNS reverse lookup. Ensure your DNS server has PTR records configured for the IP addresses you're scanning, or they will appear empty.

---

### macOS Installation (Intel & Apple Silicon)

#### 1. Install Homebrew (if not installed)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### 2. Install Dependencies

```bash
# Install Docker Desktop
brew install --cask docker

# Install Node.js 20
brew install node@20
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Install Python 3.11
brew install python@3.11

# Install Poetry
curl -sSL https://install.python-poetry.org | python3 -

# Verify installations
docker --version    # Should show 24.x or higher
node --version      # Should show v20.x
python3 --version   # Should show 3.11.x
poetry --version    # Should show 1.7.x or higher
```

#### 3. Configure Docker Desktop

1. Open Docker Desktop
2. Go to **Settings → Resources**
3. Allocate at least **8 GB RAM** and **4 CPUs**
4. Enable **Use Virtualization Framework** (Apple Silicon)
5. Click **Apply & Restart**

#### 4. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/your-org/netnynja-enterprise.git
cd netnynja-enterprise

# Copy environment file and configure
cp .env.example .env
# Edit .env with your passwords (POSTGRES_PASSWORD, REDIS_PASSWORD, etc.)

# Install dependencies
npm install
poetry install

# Build and start the platform
docker compose build           # Build containers (includes nmap)
docker compose --profile ipam --profile npm --profile stig up -d
```

#### macOS-Specific Notes

- **Apple Silicon**: Ensure Rosetta 2 is installed for x86 compatibility: `softwareupdate --install-rosetta`
- **Network Access**: For NMAP fingerprinting to detect MAC addresses, Docker must have access to the host network
- **Firewall**: If macOS firewall is enabled, allow Docker to accept incoming connections

---

### Windows 11 / Windows Server 2022 Installation

#### 1. Enable WSL2

Open PowerShell as Administrator:

```powershell
# Enable WSL2
wsl --install

# Restart your computer when prompted
```

#### 2. Install Docker Desktop

1. Download [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)
2. Run the installer
3. During installation, ensure **Use WSL 2 instead of Hyper-V** is checked
4. Complete installation and restart if prompted

#### 3. Configure Docker Desktop

1. Open Docker Desktop
2. Go to **Settings → General**
   - Ensure **Use the WSL 2 based engine** is checked
3. Go to **Settings → Resources → WSL Integration**
   - Enable integration with your default WSL distro
4. Go to **Settings → Resources → Advanced**
   - Allocate at least **8 GB RAM** and **4 CPUs**
5. Click **Apply & Restart**

#### 4. Install Node.js

1. Download [Node.js 20 LTS](https://nodejs.org/) Windows installer
2. Run the installer with default options
3. Verify: Open new PowerShell and run `node --version`

#### 5. Install Python 3.11

1. Download [Python 3.11](https://www.python.org/downloads/) Windows installer
2. **Important**: Check **Add Python to PATH** during installation
3. Enable **long paths** during installation
4. Verify: `python --version`

#### 6. Install Poetry

```powershell
# Install Poetry
(Invoke-WebRequest -Uri https://install.python-poetry.org -UseBasicParsing).Content | python -

# Add Poetry to PATH (add to PowerShell profile)
$env:Path += ";$env:APPDATA\Python\Scripts"

# Verify
poetry --version
```

#### 7. Configure Git for LF Line Endings

```powershell
git config --global core.autocrlf input
git config --global core.eol lf
```

#### 8. Clone and Setup

```powershell
# Clone the repository
git clone https://github.com/your-org/netnynja-enterprise.git
cd netnynja-enterprise

# Copy environment file
Copy-Item .env.example .env
# Edit .env with your passwords using Notepad or VS Code

# Install dependencies
npm install
poetry install

# Build and start the platform
docker compose build           # Build containers (includes nmap)
docker compose --profile ipam --profile npm --profile stig up -d
```

#### Windows-Specific Notes

- **Docker not in PATH**: If `docker` command fails, add `C:\Program Files\Docker\Docker\resources\bin` to your PATH
- **Credential Helper**: If git credential issues occur, run: `git config --global credential.helper manager`
- **Long Paths**: Enable long paths if you encounter path length errors:
  ```powershell
  # Run as Administrator
  Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1
  ```
- **Docker Credential Store**: If Docker pulls fail with credential errors, remove `"credsStore": "desktop"` from `%USERPROFILE%\.docker\config.json`
- **NMAP Scanning**: NMAP runs inside Docker containers, so no Windows-side installation is needed. For MAC address fingerprinting, ensure Docker Desktop network mode allows access to the target network segment.

---

### Red Hat Enterprise Linux 9.x Installation

#### 1. Install Docker

```bash
# Remove old Docker versions
sudo dnf remove docker docker-client docker-client-latest docker-common \
    docker-latest docker-latest-logrotate docker-logrotate docker-engine podman runc

# Add Docker repository
sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo

# Install Docker
sudo dnf install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add your user to docker group (logout/login required)
sudo usermod -aG docker $USER

# Verify
docker --version
docker compose version
```

#### 2. Install Node.js 20

```bash
# Enable Node.js 20 module
sudo dnf module enable nodejs:20

# Install Node.js
sudo dnf install nodejs

# Verify
node --version
npm --version
```

#### 3. Install Python 3.11

```bash
# Install Python 3.11
sudo dnf install python3.11 python3.11-pip python3.11-devel

# Set as default (optional)
sudo alternatives --set python3 /usr/bin/python3.11

# Verify
python3.11 --version
```

#### 4. Install Poetry

```bash
# Install Poetry
curl -sSL https://install.python-poetry.org | python3.11 -

# Add to PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Verify
poetry --version
```

#### 5. Configure Firewall

```bash
# Open required ports
sudo firewall-cmd --permanent --add-port=3000-3007/tcp  # Application ports
sudo firewall-cmd --permanent --add-port=5433/tcp      # PostgreSQL
sudo firewall-cmd --permanent --add-port=6379/tcp      # Redis
sudo firewall-cmd --permanent --add-port=8200/tcp      # Vault
sudo firewall-cmd --permanent --add-port=8222/tcp      # NATS monitoring
sudo firewall-cmd --permanent --add-port=9090/tcp      # Prometheus
sudo firewall-cmd --permanent --add-port=16686/tcp     # Jaeger

# Reload firewall
sudo firewall-cmd --reload
```

#### 6. Configure SELinux (if enabled)

```bash
# For bind mounts, use :Z suffix in docker-compose.yml
# Or set SELinux to permissive for Docker
sudo setsebool -P container_manage_cgroup on
```

#### 7. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/your-org/netnynja-enterprise.git
cd netnynja-enterprise

# Copy environment file
cp .env.example .env
# Edit .env with your passwords

# Install dependencies
npm install
poetry install

# Build and start the platform
docker compose build           # Build containers (includes nmap)
docker compose --profile ipam --profile npm --profile stig up -d
```

#### RHEL-Specific Notes

- **Podman Alternative**: RHEL includes Podman natively. If you prefer Podman:
  ```bash
  sudo dnf install podman podman-compose
  alias docker=podman
  ```
- **SELinux**: Add `:Z` suffix to volume mounts if you encounter permission issues
- **Resource Limits**: Check `ulimit -n` and increase if needed for large deployments
- **NMAP Scanning**: NMAP is included in the gateway container. For NMAP to detect MAC addresses, the container must have network access to the target subnet (consider using `--network=host` in production)
- **Firewall Zones**: If scanning external networks, ensure the Docker interface is in a trusted zone:
  ```bash
  sudo firewall-cmd --zone=trusted --add-interface=docker0 --permanent
  sudo firewall-cmd --reload
  ```

---

## Quick Start (All Platforms)

After completing the platform-specific installation above:

```bash
# Navigate to project directory
cd netnynja-enterprise

# Build containers (required for NMAP support)
docker compose build

# Start all services
docker compose --profile ipam --profile npm --profile stig up -d

# Verify services are running
docker compose ps

# Verify NMAP is available (optional)
docker exec netnynja-gateway nmap --version

# View logs
docker compose logs -f gateway
```

### Access Points

| Service         | URL                    | Credentials         |
| --------------- | ---------------------- | ------------------- |
| Web UI          | http://localhost:3000  | admin / (from .env) |
| API Gateway     | http://localhost:3001  | -                   |
| Grafana         | http://localhost:3002  | admin / (from .env) |
| NATS Monitoring | http://localhost:8222  | -                   |
| Jaeger Tracing  | http://localhost:16686 | -                   |
| Vault           | http://localhost:8200  | (dev token)         |

> **Note**: See [DOCKER_STRUCTURE.md](DOCKER_STRUCTURE.md) for complete container architecture and port allocation.

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
│   ├── stig/             # STIG Python Services
│   └── syslog/           # Syslog Python Services
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
docker compose --profile syslog up -d

# Run tests
npm run test                    # TypeScript tests
npm run test -w apps/gateway    # Gateway tests only
poetry run pytest               # Python tests

# Run with coverage
npm run test:coverage -w apps/gateway

# Run performance benchmarks
npm run benchmark -w apps/gateway         # All benchmarks
npm run benchmark:health -w apps/gateway  # Health endpoints only
npm run benchmark:auth -w apps/gateway    # Auth endpoints only
npm run benchmark:ipam -w apps/gateway    # IPAM endpoints only

# Lint code
npm run lint
poetry run ruff check .

# Format code
npm run format
poetry run black .

# Type check
npm run typecheck
poetry run mypy .

# Validate workspaces (cross-platform)
./scripts/validate-workspaces.sh

# Validate Poetry (cross-platform)
./scripts/validate-poetry.sh              # Linux/macOS
./scripts/validate-poetry.ps1             # Windows PowerShell
```

### Working with Claude Code

This project includes `CLAUDE.md` with comprehensive instructions for AI-assisted development. Key patterns:

- Always read CLAUDE.md first for context
- Follow the monorepo conventions
- Use the shared packages for common functionality
- Security-first approach for all changes

## Testing

### Unit Tests

```bash
# Run all gateway tests
npm run test -w apps/gateway

# Run with coverage report
npm run test:coverage -w apps/gateway
```

Coverage thresholds: 50% branches, functions, lines, statements

### Performance Benchmarks

The gateway includes performance benchmarks using [autocannon](https://github.com/mcollina/autocannon):

| Suite  | Endpoints                 | Target RPS   |
| ------ | ------------------------- | ------------ |
| Health | /healthz, /livez, /readyz | 5,000-10,000 |
| Auth   | /api/v1/auth/\*           | 100-2,000    |
| IPAM   | /api/v1/ipam/\*           | 200-1,000    |

```bash
# Run all benchmarks (gateway must be running)
npm run benchmark -w apps/gateway

# JSON output for CI integration
node apps/gateway/tests/benchmarks/run-all.js --json
```

See `apps/gateway/tests/benchmarks/README.md` for detailed documentation.

## Features

### IPAM Module

- Network scanning (ICMP Ping, TCP Port Scan, NMAP Full Scan)
- Multi-type scans (run Ping+TCP+NMAP simultaneously)
- Host fingerprinting with OS detection (TTL-based), hostname resolution, MAC/vendor detection
- NMAP integration with XML parsing for enhanced discovery
- Scan management (create, view, delete, export PDF/CSV)
- Add discovered hosts to NPM monitoring
- Site designation for networks

### NPM Module

- SNMPv3 device monitoring (FIPS-compliant: SHA-256+, AES-256)
- Network discovery with ICMP/SNMPv3
- Device fingerprinting (vendor, model, OS from SNMP and MAC OUI)
- CPU, memory, latency, availability metrics
- Interface and volume monitoring
- Health/status PDF and CSV export
- Scales to 3000+ devices

### STIG Module

- STIG Library management (upload .zip, parse XCCDF)
- Checklist import (.ckl, .cklb, .xml from STIG Viewer)
- Support for 16+ platforms (Cisco, Juniper, Palo Alto, Fortinet, etc.)
- CKL/PDF report generation
- Editable assets with STIG selection

### Syslog Module

- UDP/TCP listener on port 514
- RFC 3164/5424 parsing
- Device type detection (Cisco, Juniper, Palo Alto, Linux, Windows)
- 10GB circular buffer with configurable retention
- Forward to external SIEM via UDP/TCP/TLS

### Settings Module

- User management (create, edit, disable)
- Role-based access (Admin/Operator/Viewer)
- Password reset by admin
- Account unlock functionality

## Security

- JWT + Argon2id authentication
- Role-based access control (Admin/Operator/Viewer)
- All secrets in HashiCorp Vault
- SNMPv3 credentials encrypted with AES-256-GCM
- TLS for production deployments
- Container image scanning with Trivy
- Pre-commit hooks for security checks

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
