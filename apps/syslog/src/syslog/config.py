"""Configuration for syslog service."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Syslog service settings."""

    # Server
    SYSLOG_HOST: str = "0.0.0.0"
    SYSLOG_PORT: int = 3007
    SYSLOG_UDP_PORT: int = 514
    SYSLOG_TCP_PORT: int = 514

    # Buffer settings
    SYSLOG_BUFFER_SIZE_GB: int = 10
    SYSLOG_RETENTION_DAYS: int = 30

    # --- Security: Message size cap ---
    # Maximum size of a single syslog message in bytes.
    # Messages exceeding this limit are silently dropped.
    # RFC 5426 recommends minimum 2048; 8192 is generous for structured syslog.
    SYSLOG_MAX_MESSAGE_SIZE: int = 8192

    # --- Security: Rate limiting ---
    # Maximum messages per second across all sources (global).
    # Set to 0 to disable rate limiting (NOT recommended for production).
    SYSLOG_MAX_MESSAGES_PER_SECOND: int = 10000

    # Maximum messages per second from a single source IP.
    # Prevents any one device from overwhelming the collector.
    SYSLOG_MAX_PER_SOURCE_PER_SECOND: int = 1000

    # --- Security: IP allowlist ---
    # Comma-separated list of allowed source IPs or CIDR ranges.
    # Empty string = accept from all sources (development only).
    # Example: "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
    SYSLOG_ALLOWED_SOURCES: str = ""

    # --- Security: Backpressure ---
    # Maximum events held in the in-memory buffer before applying backpressure.
    # When exceeded, new messages are dropped until the buffer drains.
    SYSLOG_MAX_BUFFER_SIZE: int = 100000

    # Database
    POSTGRES_URL: str = "postgresql://gridwatch:gridwatch@localhost:5432/gridwatch"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # NATS
    NATS_URL: str = "nats://localhost:4222"

    # --- Security: CORS (SEC-020) ---
    # Comma-separated list of allowed CORS origins.
    # Defaults to local dev UI. Set to gateway origin in production.
    SYSLOG_CORS_ORIGINS: str = "http://localhost:3000"

    # --- Security: Forwarding TLS defaults (SEC-022) ---
    # When true, forwarders default to TLS-enabled transport.
    # Individual forwarders can override via database config.
    SYSLOG_FORWARD_TLS_DEFAULT: bool = True
    # Path to CA certificate bundle for forwarder TLS verification.
    # Empty = use system default CA store.
    SYSLOG_FORWARD_TLS_CA_CERT: str = ""

    # --- Security: Payload redaction (SEC-023) ---
    # Maximum size (bytes) of raw_message stored in database.
    # Messages exceeding this are truncated with [TRUNCATED] marker.
    SYSLOG_MAX_STORED_PAYLOAD: int = 4096
    # Comma-separated regex patterns for sensitive data redaction.
    # Matched content is replaced with [REDACTED] before storage.
    # Default patterns catch common password/key/token fields.
    SYSLOG_REDACTION_PATTERNS: str = (
        r"(?i)password\s*[=:]\s*\S+,"
        r"(?i)secret\s*[=:]\s*\S+,"
        r"(?i)token\s*[=:]\s*\S+,"
        r"(?i)api[_-]?key\s*[=:]\s*\S+,"
        r"(?i)private[_-]?key\s*[=:]\s*\S+,"
        r"(?i)auth[_-]?key\s*[=:]\s*\S+"
    )

    # Logging
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
