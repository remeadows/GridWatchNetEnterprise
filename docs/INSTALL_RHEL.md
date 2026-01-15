# Red Hat Enterprise Linux 9.x Installation

> Platform-specific installation guide for NetNynja Enterprise on RHEL 9.x

## Prerequisites

| Component | Version | Notes                           |
| --------- | ------- | ------------------------------- |
| Docker    | 24+     | With Docker Compose V2          |
| Node.js   | 20+     | For development                 |
| Python    | 3.11+   | For development                 |
| Poetry    | 1.7+    | Python package manager          |
| Git       | 2.40+   | With LF line endings configured |

## Installation Steps

### 1. Install Docker

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

### 2. Install Node.js 20

```bash
# Enable Node.js 20 module
sudo dnf module enable nodejs:20

# Install Node.js
sudo dnf install nodejs

# Verify
node --version
npm --version
```

### 3. Install Python 3.11

```bash
# Install Python 3.11
sudo dnf install python3.11 python3.11-pip python3.11-devel

# Set as default (optional)
sudo alternatives --set python3 /usr/bin/python3.11

# Verify
python3.11 --version
```

### 4. Install Poetry

```bash
# Install Poetry
curl -sSL https://install.python-poetry.org | python3.11 -

# Add to PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Verify
poetry --version
```

### 5. Configure Firewall

```bash
# Open required ports
sudo firewall-cmd --permanent --add-port=3000-3007/tcp  # Application ports
sudo firewall-cmd --permanent --add-port=5433/tcp      # PostgreSQL
sudo firewall-cmd --permanent --add-port=6379/tcp      # Redis
sudo firewall-cmd --permanent --add-port=8300/tcp      # Vault (Windows-safe port)
sudo firewall-cmd --permanent --add-port=8322/tcp      # NATS monitoring (Windows-safe port)
sudo firewall-cmd --permanent --add-port=9090/tcp      # Prometheus
sudo firewall-cmd --permanent --add-port=16686/tcp     # Jaeger

# Reload firewall
sudo firewall-cmd --reload
```

### 6. Configure SELinux (if enabled)

```bash
# For bind mounts, use :Z suffix in docker-compose.yml
# Or set SELinux to permissive for Docker
sudo setsebool -P container_manage_cgroup on
```

### 7. Clone and Setup

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

## RHEL-Specific Notes

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

## Next Steps

After installation, see the [Quick Start](../README.md#quick-start-all-platforms) section in the main README.
