"""STIG service configuration."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with environment variable support."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Service settings
    host: str = Field(default="0.0.0.0", alias="STIG_HOST")
    port: int = Field(default=3005, alias="STIG_PORT")
    environment: Literal["development", "staging", "production"] = Field(
        default="development", alias="ENVIRONMENT"
    )
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # Database
    postgres_url: PostgresDsn = Field(..., alias="POSTGRES_URL")

    # Redis
    redis_url: str = Field(default="redis://localhost:6379", alias="REDIS_URL")

    # NATS
    nats_url: str = Field(default="nats://localhost:4222", alias="NATS_URL")

    # Vault
    vault_addr: str = Field(default="http://localhost:8200", alias="VAULT_ADDR")
    vault_token: str | None = Field(default=None, alias="VAULT_TOKEN")

    # JWT
    jwt_secret: str = Field(default="dev-secret-change-in-production", alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")

    # Audit settings
    default_ssh_timeout: int = Field(default=30, alias="SSH_TIMEOUT")
    default_ssh_port: int = Field(default=22, alias="SSH_PORT")
    max_concurrent_audits: int = Field(default=5, alias="MAX_CONCURRENT_AUDITS")
    audit_result_retention_days: int = Field(default=365, alias="AUDIT_RETENTION_DAYS")

    # Report settings
    report_output_dir: str = Field(default="/app/output", alias="REPORT_OUTPUT_DIR")
    report_template_dir: str = Field(default="/app/templates", alias="REPORT_TEMPLATE_DIR")

    @property
    def is_development(self) -> bool:
        """Check if running in development mode."""
        return self.environment == "development"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
