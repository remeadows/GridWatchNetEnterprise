"""Cryptographic utilities for secure credential storage."""

import base64
import os
from typing import Any

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from ..core.config import settings
from ..core.logging import get_logger

logger = get_logger(__name__)


class CryptoService:
    """Service for encrypting/decrypting sensitive data."""

    def __init__(self, key: str | None = None) -> None:
        """Initialize with encryption key.

        Uses JWT_SECRET as the base key by default.
        """
        self._key = key or settings.jwt_secret or "netnynja-default-key-change-in-production"
        self._fernet = self._create_fernet()

    def _create_fernet(self) -> Fernet:
        """Create Fernet instance from key."""
        # Derive a proper key from the secret
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"netnynja-npm-salt",  # Static salt for deterministic key derivation
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(self._key.encode()))
        return Fernet(key)

    def encrypt(self, plaintext: str) -> str:
        """Encrypt a string and return base64-encoded ciphertext."""
        if not plaintext:
            return ""
        try:
            encrypted = self._fernet.encrypt(plaintext.encode())
            return base64.urlsafe_b64encode(encrypted).decode()
        except Exception as e:
            logger.error("encryption_failed", error=str(e))
            raise ValueError("Failed to encrypt data") from e

    def decrypt(self, ciphertext: str) -> str:
        """Decrypt a base64-encoded ciphertext string."""
        if not ciphertext:
            return ""
        try:
            encrypted = base64.urlsafe_b64decode(ciphertext.encode())
            decrypted = self._fernet.decrypt(encrypted)
            return decrypted.decode()
        except Exception as e:
            logger.error("decryption_failed", error=str(e))
            raise ValueError("Failed to decrypt data") from e


# Singleton instance
_crypto_service: CryptoService | None = None


def get_crypto_service() -> CryptoService:
    """Get the crypto service singleton."""
    global _crypto_service
    if _crypto_service is None:
        _crypto_service = CryptoService()
    return _crypto_service
