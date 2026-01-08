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

    # Database
    POSTGRES_URL: str = "postgresql://netnynja:netnynja@localhost:5432/netnynja"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # NATS
    NATS_URL: str = "nats://localhost:4222"

    # Logging
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
