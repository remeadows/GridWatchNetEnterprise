"""HashiCorp Vault integration for credential management."""

from typing import Any

import httpx

from ..core.config import settings
from ..core.logging import get_logger

logger = get_logger(__name__)


class VaultService:
    """Service for retrieving credentials from HashiCorp Vault."""

    def __init__(self) -> None:
        """Initialize Vault client."""
        self.vault_addr = settings.vault_addr
        self.vault_token = settings.vault_token
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.vault_addr,
                headers={"X-Vault-Token": self.vault_token} if self.vault_token else {},
                timeout=10.0,
            )
        return self._client

    async def close(self) -> None:
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def get_ssh_credentials(self, credential_id: str) -> dict[str, Any] | None:
        """Get SSH credentials from Vault.

        Args:
            credential_id: Path to the secret in Vault

        Returns:
            Dictionary with username, password/key_file, and optional passphrase
        """
        if not self.vault_token:
            logger.warning("vault_not_configured")
            return None

        try:
            client = await self._get_client()
            response = await client.get(f"/v1/secret/data/{credential_id}")

            if response.status_code == 200:
                data = response.json()
                return data.get("data", {}).get("data", {})
            else:
                logger.warning(
                    "vault_credential_not_found",
                    credential_id=credential_id,
                    status=response.status_code,
                )
                return None

        except httpx.RequestError as e:
            logger.error("vault_request_failed", credential_id=credential_id, error=str(e))
            return None

    async def get_winrm_credentials(self, credential_id: str) -> dict[str, Any] | None:
        """Get WinRM credentials from Vault.

        Args:
            credential_id: Path to the secret in Vault

        Returns:
            Dictionary with username and password
        """
        return await self.get_ssh_credentials(credential_id)

    async def get_api_credentials(self, credential_id: str) -> dict[str, Any] | None:
        """Get API credentials from Vault.

        Args:
            credential_id: Path to the secret in Vault

        Returns:
            Dictionary with api_key, token, or other auth info
        """
        return await self.get_ssh_credentials(credential_id)
