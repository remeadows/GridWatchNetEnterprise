"""Cryptographic utilities for secure credential storage."""

import base64
import os

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from ..core.config import settings
from ..core.logging import get_logger

logger = get_logger(__name__)


class CryptoService:
    """Service for encrypting/decrypting sensitive data.

    Uses per-encryption random salts stored with the ciphertext for security.
    Format: base64(salt + encrypted_data)
    """

    # Salt length for PBKDF2 key derivation
    SALT_LENGTH = 16

    def __init__(self, key: str | None = None) -> None:
        """Initialize with encryption key.

        Uses NPM_CREDENTIAL_KEY from settings (required in production).
        """
        self._key = key or settings.credential_encryption_key

    def _derive_fernet(self, salt: bytes) -> Fernet:
        """Derive Fernet instance from key and salt."""
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(self._key.encode()))
        return Fernet(key)

    def encrypt(self, plaintext: str) -> str:
        """Encrypt a string with a random salt and return base64-encoded result.

        The salt is prepended to the encrypted data for later decryption.
        """
        if not plaintext:
            return ""
        try:
            # Generate random salt for this encryption
            salt = os.urandom(self.SALT_LENGTH)
            fernet = self._derive_fernet(salt)
            encrypted = fernet.encrypt(plaintext.encode())
            # Combine salt + encrypted data
            combined = salt + encrypted
            return base64.urlsafe_b64encode(combined).decode()
        except Exception as e:
            logger.error("encryption_failed", error=str(e))
            raise ValueError("Failed to encrypt data") from e

    def decrypt(self, ciphertext: str) -> str:
        """Decrypt a base64-encoded ciphertext string.

        Extracts the salt from the beginning of the decoded data.
        """
        if not ciphertext:
            return ""
        try:
            combined = base64.urlsafe_b64decode(ciphertext.encode())
            # Extract salt and encrypted data
            salt = combined[:self.SALT_LENGTH]
            encrypted = combined[self.SALT_LENGTH:]
            fernet = self._derive_fernet(salt)
            decrypted = fernet.decrypt(encrypted)
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
