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
    nats_user: str | None = Field(default=None, alias="NATS_USER")
    nats_password: str | None = Field(default=None, alias="NATS_PASSWORD")
    nats_tls_enabled: bool = Field(default=False, alias="NATS_TLS_ENABLED")
    nats_tls_ca: str | None = Field(default=None, alias="NATS_TLS_CA")  # Path to CA cert

    # Vault
    vault_addr: str = Field(default="http://localhost:8200", alias="VAULT_ADDR")
    vault_token: str | None = Field(default=None, alias="VAULT_TOKEN")

    # JWT - MUST be set via environment variable in production
    jwt_secret: str = Field(..., alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_issuer: str = Field(default="gridwatch-net-enterprise", alias="JWT_ISSUER")
    jwt_audience: str = Field(default="gridwatch-api", alias="JWT_AUDIENCE")

    # Audit settings
    default_ssh_timeout: int = Field(default=30, alias="SSH_TIMEOUT")
    default_ssh_port: int = Field(default=22, alias="SSH_PORT")
    max_concurrent_audits: int = Field(default=5, alias="MAX_CONCURRENT_AUDITS")
    audit_result_retention_days: int = Field(default=365, alias="AUDIT_RETENTION_DAYS")

    # SSH Security settings
    ssh_strict_host_key: bool = Field(
        default=True,
        alias="STIG_SSH_STRICT_HOST_KEY",
        description="Enforce SSH host key verification. Only disable in isolated lab environments.",
    )
    ssh_known_hosts_file: str | None = Field(
        default=None,
        alias="STIG_SSH_KNOWN_HOSTS_FILE",
        description="Path to SSH known_hosts file. Uses system default if not set.",
    )

    # Config upload size limit (SEC-017)
    max_config_upload_size: int = Field(
        default=10 * 1024 * 1024,  # 10 MB
        alias="STIG_MAX_UPLOAD_SIZE",
        description="Maximum config file upload size in bytes. Returns 413 if exceeded.",
    )
    allowed_config_extensions: str = Field(
        default=".txt,.xml,.conf,.cfg",
        alias="STIG_ALLOWED_CONFIG_EXTENSIONS",
        description="Comma-separated list of allowed config file extensions.",
    )

    # XML/ZIP upload size limits (SEC-016)
    max_xml_size: int = Field(
        default=50 * 1024 * 1024,  # 50 MB
        alias="STIG_MAX_XML_SIZE",
        description="Maximum allowed XML file size in bytes for XCCDF/CKL parsing.",
    )
    max_zip_entry_size: int = Field(
        default=100 * 1024 * 1024,  # 100 MB
        alias="STIG_MAX_ZIP_ENTRY_SIZE",
        description="Maximum allowed size of a single file extracted from a STIG ZIP.",
    )
    max_zip_entries: int = Field(
        default=500,
        alias="STIG_MAX_ZIP_ENTRIES",
        description="Maximum number of entries allowed in a STIG ZIP archive.",
    )

    # Report settings
    report_output_dir: str = Field(default="/app/output", alias="REPORT_OUTPUT_DIR")
    report_template_dir: str = Field(default="/app/templates", alias="REPORT_TEMPLATE_DIR")

    # STIG Library settings
    stig_library_path: str | None = Field(default=None, alias="STIG_LIBRARY_PATH")

    @property
    def is_development(self) -> bool:
        """Check if running in development mode."""
        return self.environment == "development"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
