# GridWatch STIG Manager Service

Security Technical Implementation Guide compliance service for GridWatch NetEnterprise.

## Features

- SSH/Netmiko-based compliance auditing
- Multi-platform support (Linux, macOS, Cisco, Arista, Juniper, etc.)
- CKL export for DISA STIG Viewer
- PDF report generation with ReportLab

## Development

```bash
# Install dependencies
pip install -e ".[dev]"

# Run service
uvicorn stig.main:app --reload --port 3005
```

## API

Service runs on port 3005. See OpenAPI docs at `/docs`.
