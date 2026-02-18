# GridWatch IPAM Service

IP Address Management service for GridWatch NetEnterprise.

## Features

- Network discovery via ping/TCP/NMAP scanning
- CIDR/subnet management with PostgreSQL INET types
- Async scanning with NATS JetStream
- VictoriaMetrics integration for utilization metrics

## Development

```bash
# Install dependencies
pip install -e ".[dev]"

# Run service
uvicorn ipam.main:app --reload --port 3003
```

## API

Service runs on port 3003. See OpenAPI docs at `/docs`.
