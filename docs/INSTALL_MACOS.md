# macOS Installation (Intel & Apple Silicon)

> Platform-specific installation guide for GridWatch NetEnterprise on macOS

## Prerequisites

| Component | Version | Notes                           |
| --------- | ------- | ------------------------------- |
| Docker    | 24+     | With Docker Compose V2          |
| Node.js   | 20+     | For development                 |
| Python    | 3.11+   | For development                 |
| Poetry    | 1.7+    | Python package manager          |
| Git       | 2.40+   | With LF line endings configured |

## Installation Steps

### 1. Install Homebrew (if not installed)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Install Dependencies

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

### 3. Configure Docker Desktop

1. Open Docker Desktop
2. Go to **Settings → Resources**
3. Allocate at least **8 GB RAM** and **4 CPUs**
4. Enable **Use Virtualization Framework** (Apple Silicon)
5. Click **Apply & Restart**

### 4. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/your-org/gridwatch-net-enterprise.git
cd gridwatch-net-enterprise

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

## macOS-Specific Notes

- **Apple Silicon**: Ensure Rosetta 2 is installed for x86 compatibility: `softwareupdate --install-rosetta`
- **Network Access**: For NMAP fingerprinting to detect MAC addresses, Docker must have access to the host network
- **Firewall**: If macOS firewall is enabled, allow Docker to accept incoming connections

## Next Steps

After installation, see the [Quick Start](../README.md#quick-start-all-platforms) section in the main README.
