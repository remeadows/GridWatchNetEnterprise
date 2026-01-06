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
    host: str = Field(default="0.0.0.0", alias="NPM_HOST")
    port: int = Field(default=3004, alias="NPM_PORT")
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

    # JWT
    jwt_secret: str | None = Field(default=None, alias="JWT_SECRET")
    jwt_public_key: str | None = Field(default=None, alias="JWT_PUBLIC_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")

    # VictoriaMetrics
    victoria_url: str = Field(
        default="http://localhost:8428", alias="VICTORIAMETRICS_URL"
    )

    # Vault
    vault_addr: str = Field(default="http://localhost:8200", alias="VAULT_ADDR")
    vault_token: str | None = Field(default=None, alias="VAULT_TOKEN")

    # Observability
    otel_enabled: bool = Field(default=False, alias="OTEL_ENABLED")
    otel_service_name: str = Field(default="npm-service", alias="OTEL_SERVICE_NAME")
    jaeger_endpoint: str | None = Field(default=None, alias="JAEGER_ENDPOINT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # Polling
    default_poll_interval: int = Field(default=60, alias="DEFAULT_POLL_INTERVAL")
    snmp_timeout: float = Field(default=5.0, alias="SNMP_TIMEOUT")
    snmp_retries: int = Field(default=3, alias="SNMP_RETRIES")
    max_concurrent_polls: int = Field(default=50, alias="MAX_CONCURRENT_POLLS")

    # Alerting
    alert_evaluation_interval: int = Field(default=30, alias="ALERT_EVALUATION_INTERVAL")
    alert_retention_days: int = Field(default=30, alias="ALERT_RETENTION_DAYS")

    @property
    def is_development(self) -> bool:
        """Check if running in development mode."""
        return self.environment == "development"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
