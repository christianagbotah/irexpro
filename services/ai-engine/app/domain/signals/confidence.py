"""Confidence score utilities."""
from __future__ import annotations

from app.core.config import get_settings


def is_above_threshold(confidence_score: float) -> bool:
    """Check if a confidence score meets the minimum threshold from config."""
    settings = get_settings()
    return confidence_score >= settings.ai_min_confidence_score


def get_threshold() -> float:
    return get_settings().ai_min_confidence_score
