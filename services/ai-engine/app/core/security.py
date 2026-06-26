"""
Security utilities for the AI Engine.

IMPORTANT RULES:
- Never log secrets, API keys, or tokens
- Never include secrets in error messages
- Internal API key is validated via constant-time comparison
"""
from __future__ import annotations

import hmac

from app.core.config import get_settings


def validate_internal_api_key(provided_key: str) -> bool:
    """
    Validate the internal API key using constant-time comparison.
    Prevents timing attacks.
    """
    settings = get_settings()
    expected = settings.nestjs_internal_api_key
    return hmac.compare_digest(provided_key.encode(), expected.encode())


# Fields that must NEVER appear in any outbound payload or log
FORBIDDEN_PAYLOAD_FIELDS = frozenset({
    "password",
    "passwordHash",
    "accessToken",
    "refreshToken",
    "apiKey",
    "api_key",
    "encryptedCredentials",
    "credentialIv",
    "credentialTag",
    "secretKey",
    "secret",
    "privateKey",
})


def sanitize_metadata(metadata: dict) -> dict:
    """Remove any forbidden fields from metadata before including in a signal."""
    return {k: v for k, v in metadata.items() if k not in FORBIDDEN_PAYLOAD_FIELDS}
