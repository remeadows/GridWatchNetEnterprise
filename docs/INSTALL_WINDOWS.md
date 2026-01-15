# Windows 11 / Windows Server 2022 Installation

> Platform-specific installation guide for NetNynja Enterprise on Windows

## Prerequisites

| Component | Version | Notes                           |
| --------- | ------- | ------------------------------- |
| Docker    | 24+     | With Docker Compose V2          |
| Node.js   | 20+     | For development                 |
| Python    | 3.11+   | For development                 |
| Poetry    | 1.7+    | Python package manager          |
| Git       | 2.40+   | With LF line endings configured |

## Installation Steps

### 1. Enable WSL2

Open PowerShell as Administrator:

```powershell
# Enable WSL2
wsl --install

# Restart your computer when prompted
```

### 2. Install Docker Desktop

1. Download [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)
2. Run the installer
3. During installation, ensure **Use WSL 2 instead of Hyper-V** is checked
4. Complete installation and restart if prompted

### 3. Configure Docker Desktop

1. Open Docker Desktop
2. Go to **Settings → General**
   - Ensure **Use the WSL 2 based engine** is checked
3. Go to **Settings → Resources → WSL Integration**
   - Enable integration with your default WSL distro
4. Go to **Settings → Resources → Advanced**
   - Allocate at least **8 GB RAM** and **4 CPUs**
5. Click **Apply & Restart**

### 4. Install Node.js

1. Download [Node.js 20 LTS](https://nodejs.org/) Windows installer
2. Run the installer with default options
3. Verify: Open new PowerShell and run `node --version`

### 5. Install Python 3.11

1. Download [Python 3.11](https://www.python.org/downloads/) Windows installer
2. **Important**: Check **Add Python to PATH** during installation
3. Enable **long paths** during installation
4. Verify: `python --version`

### 6. Install Poetry

```powershell
# Install Poetry
(Invoke-WebRequest -Uri https://install.python-poetry.org -UseBasicParsing).Content | python -

# Add Poetry to PATH (add to PowerShell profile)
$env:Path += ";$env:APPDATA\Python\Scripts"

# Verify
poetry --version
```

### 7. Configure Git for LF Line Endings

```powershell
git config --global core.autocrlf input
git config --global core.eol lf
```

### 8. Clone and Setup

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

## Windows-Specific Notes

- **Docker not in PATH**: If `docker` command fails, add `C:\Program Files\Docker\Docker\resources\bin` to your PATH
- **Credential Helper**: If git credential issues occur, run: `git config --global credential.helper manager`
- **Long Paths**: Enable long paths if you encounter path length errors:
  ```powershell
  # Run as Administrator
  Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1
  ```
- **Docker Credential Store**: If Docker pulls fail with credential errors, remove `"credsStore": "desktop"` from `%USERPROFILE%\.docker\config.json`
- **NMAP Scanning**: NMAP runs inside Docker containers, so no Windows-side installation is needed. For MAC address fingerprinting, ensure Docker Desktop network mode allows access to the target network segment.

## Next Steps

After installation, see the [Quick Start](../README.md#quick-start-all-platforms) section in the main README.
