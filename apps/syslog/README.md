# NetNynja Syslog Service

Centralized syslog collection service for NetNynja Enterprise.

## Features

- UDP 514 listener for syslog reception (RFC 3164 and RFC 5424)
- Device and event type parsing
- 10GB circular buffer with automatic cleanup
- Syslog forwarding to external systems (SIEM, etc.)
- PostgreSQL storage for event persistence
- NATS JetStream for real-time event streaming

## Architecture

```
                    +-----------------+
                    |   UDP 514       |
                    |   Listener      |
                    +--------+--------+
                             |
                             v
                    +--------+--------+
                    |   Parser        |
                    |   (RFC 3164/    |
                    |    RFC 5424)    |
                    +--------+--------+
                             |
              +--------------+-------------+
              |              |             |
              v              v             v
      +-------+------+  +----+----+  +----+----+
      |  PostgreSQL  |  |  NATS   |  | Forwarder|
      |  (Storage)   |  | Stream  |  | (SIEM)   |
      +--------------+  +---------+  +---------+
```

## Development

```bash
# Install dependencies
pip install -e ".[dev]"

# Run service
uvicorn syslog.main:app --reload --port 3007

# Run UDP collector separately (requires root for port 514)
sudo python -m syslog.collector
```

## Configuration

| Variable              | Default | Description                   |
| --------------------- | ------- | ----------------------------- |
| SYSLOG_UDP_PORT       | 514     | UDP port for syslog reception |
| SYSLOG_TCP_PORT       | 514     | TCP port for syslog reception |
| SYSLOG_BUFFER_SIZE_GB | 10      | Circular buffer size in GB    |
| POSTGRES_URL          | -       | PostgreSQL connection string  |
| REDIS_URL             | -       | Redis connection string       |
| NATS_URL              | -       | NATS server URL               |

## API

Service runs on port 3007. See Gateway OpenAPI docs at `/docs`.

## Syslog Facilities

| Code  | Name     | Description                      |
| ----- | -------- | -------------------------------- |
| 0     | kern     | Kernel messages                  |
| 1     | user     | User-level messages              |
| 2     | mail     | Mail system                      |
| 3     | daemon   | System daemons                   |
| 4     | auth     | Security/authorization           |
| 5     | syslog   | Internal syslog messages         |
| 10    | authpriv | Security/authorization (private) |
| 16-23 | local0-7 | Local use                        |

## Syslog Severities

| Code | Name          | Description               |
| ---- | ------------- | ------------------------- |
| 0    | Emergency     | System is unusable        |
| 1    | Alert         | Immediate action required |
| 2    | Critical      | Critical conditions       |
| 3    | Error         | Error conditions          |
| 4    | Warning       | Warning conditions        |
| 5    | Notice        | Normal but significant    |
| 6    | Informational | Informational messages    |
| 7    | Debug         | Debug-level messages      |
