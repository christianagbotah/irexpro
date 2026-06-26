"""Domain error types for the AI Engine."""
from __future__ import annotations


class AiEngineError(Exception):
    """Base error for all AI Engine errors."""


class ConfigurationError(AiEngineError):
    """Invalid or missing configuration."""


class MarketDataError(AiEngineError):
    """Market data fetch or cache error."""


class ModelNotFoundError(AiEngineError):
    """Requested model version not in registry."""


class SignalGenerationError(AiEngineError):
    """Error during signal generation pipeline."""


class LiveModeNotSupportedError(AiEngineError):
    """Raised when live mode is requested but not enabled in config."""


class NestJsIntegrationError(AiEngineError):
    """Error communicating with NestJS API."""
