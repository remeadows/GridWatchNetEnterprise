"""Application configuration with environment validation."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Server
    host: str = Field(default="0.0.0.0", alias="IPAM_HOST")
    port: int = Field(default=3003, alias="IPAM_PORT")
    environment: Literal["development", "production", "test"] = Field(
        default="development", alias="NODE_ENV"
    )
    debug: bool = Field(default=False, alias="DEBUG")

    # Database
    postgres_url: PostgresDsn = Field(..., alias="POSTGRES_URL")
    db_pool_min: int = Field(default=5, alias="DB_POOL_MIN")
    db_pool_max: int = Field(default=20, alias="DB_POOL_MAX")

    # Redis
    redis_url: RedisDsn = Field(..., alias="REDIS_URL")

    # NATS
    nats_url: str = Field(default="nats://localhost:4222", alias="NATS_URL")
    nats_user: str | None = Field(default=None, alias="NATS_USER")
    nats_password: str | None = Field(default=None, alias="NATS_PASSWORD")
    nats_tls_enabled: bool = Field(default=False, alias="NATS_TLS_ENABLED")
    nats_tls_ca: str | None = Field(default=None, alias="NATS_TLS_CA")  # Path to CA cert

    # JWT
    jwt_secret: str | None = Field(default=None, alias="JWT_SECRET")
    jwt_public_key: str | None = Field(default=None, alias="JWT_PUBLIC_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")

    # VictoriaMetrics
    victoria_url: str = Field(
        default="http://localhost:8428", alias="VICTORIA_METRICS_URL"
    )

    # Observability
    otel_enabled: bool = Field(default=False, alias="OTEL_ENABLED")
    otel_service_name: str = Field(default="ipam-service", alias="OTEL_SERVICE_NAME")
    jaeger_endpoint: str | None = Field(default=None, alias="JAEGER_ENDPOINT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # Scanning
    scan_timeout: int = Field(default=300, alias="SCAN_TIMEOUT")
    scan_concurrency: int = Field(default=50, alias="SCAN_CONCURRENCY")
    ping_timeout: float = Field(default=1.0, alias="PING_TIMEOUT")

    @property
    def is_development(self) -> bool:
        """Check if running in development mode."""
        return self.environment == "development"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
