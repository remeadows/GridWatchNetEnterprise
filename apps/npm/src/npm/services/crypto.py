"""Cryptographic utilities for secure credential storage."""

import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from ..core.config import settings
from ..core.logging import get_logger

logger = get_logger(__name__)


class CryptoService:
    """Service for encrypting/decrypting sensitive data.

    Uses AES-256-GCM (FIPS compliant) for encryption.
    Compatible with the gateway TypeScript encryption.
    Format: iv_hex:auth_tag_hex:encrypted_hex
    """

    # IV length for AES-GCM (12 bytes is recommended)
    IV_LENGTH = 12

    def __init__(self, key: str | None = None) -> None:
        """Initialize with encryption key.

        Uses NPM_CREDENTIAL_KEY from settings (required in production).
        """
        raw_key = key or settings.credential_encryption_key
        # Derive 32-byte key using scrypt (matching Node.js crypto.scryptSync)
        # Node.js: crypto.scryptSync(key, 'salt', 32)
        self._key = hashlib.scrypt(
            raw_key.encode(),
            salt=b"salt",
            n=16384,  # Default N value for scrypt
            r=8,      # Default r value
            p=1,      # Default p value
            dklen=32,
        )

    def encrypt(self, plaintext: str) -> str:
        """Encrypt a string and return in iv:authTag:encrypted format.

        Compatible with the gateway TypeScript encryption.
        """
        if not plaintext:
            return ""
        try:
            # Generate random IV
            iv = os.urandom(self.IV_LENGTH)
            aesgcm = AESGCM(self._key)
            # Encrypt and get ciphertext with auth tag appended
            ciphertext_with_tag = aesgcm.encrypt(iv, plaintext.encode(), None)
            # AES-GCM appends the 16-byte auth tag to the ciphertext
            ciphertext = ciphertext_with_tag[:-16]
            auth_tag = ciphertext_with_tag[-16:]
            # Format: iv:authTag:encrypted (matching Node.js format)
            return f"{iv.hex()}:{auth_tag.hex()}:{ciphertext.hex()}"
        except Exception as e:
            logger.error("encryption_failed", error=str(e))
            raise ValueError("Failed to encrypt data") from e

    def decrypt(self, ciphertext: str) -> str:
        """Decrypt a string in iv:authTag:encrypted format.

        Compatible with the gateway TypeScript encryption.
        """
        if not ciphertext:
            return ""
        try:
            parts = ciphertext.split(":")
            if len(parts) != 3:
                raise ValueError(f"Invalid encrypted data format: expected 3 parts, got {len(parts)}")

            iv_hex, auth_tag_hex, encrypted_hex = parts
            iv = bytes.fromhex(iv_hex)
            auth_tag = bytes.fromhex(auth_tag_hex)
            encrypted = bytes.fromhex(encrypted_hex)

            # AES-GCM expects ciphertext + auth_tag concatenated
            ciphertext_with_tag = encrypted + auth_tag

            aesgcm = AESGCM(self._key)
            decrypted = aesgcm.decrypt(iv, ciphertext_with_tag, None)
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
