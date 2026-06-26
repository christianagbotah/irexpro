"""Tests for AiSignalCandidate schema validation."""
from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.domain.signals.schemas import AiSignalCandidate


def make_valid_candidate(**overrides) -> dict:
    base = {
        "user_id": "user-123",
        "trading_session_id": "session-456",
        "broker_connection_id": "conn-789",
        "instrument": "EURUSD",
        "direction": "BUY",
        "confidence_score": 0.75,
        "suggested_stop_loss": 1.07000,
        "suggested_take_profit": 1.10000,
        "suggested_volume": 0.01,
        "timeframe": "H1",
        "strategy_code": "baseline-h1",
        "model_version": "baseline-xgboost-v0.1.0",
        "generated_at": datetime.now(UTC),
    }
    return {**base, **overrides}


def test_valid_candidate_is_accepted():
    candidate = AiSignalCandidate(**make_valid_candidate())
    assert candidate.direction == "BUY"
    assert candidate.confidence_score == 0.75


def test_confidence_score_below_zero_rejected():
    with pytest.raises(ValidationError, match="confidence_score"):
        AiSignalCandidate(**make_valid_candidate(confidence_score=-0.1))


def test_confidence_score_above_one_rejected():
    with pytest.raises(ValidationError, match="confidence_score"):
        AiSignalCandidate(**make_valid_candidate(confidence_score=1.5))


def test_invalid_direction_rejected():
    with pytest.raises(ValidationError):
        AiSignalCandidate(**make_valid_candidate(direction="HOLD"))


def test_missing_stop_loss_rejected():
    data = make_valid_candidate()
    del data["suggested_stop_loss"]
    with pytest.raises(ValidationError):
        AiSignalCandidate(**data)


def test_missing_take_profit_rejected():
    data = make_valid_candidate()
    del data["suggested_take_profit"]
    with pytest.raises(ValidationError):
        AiSignalCandidate(**data)


def test_negative_volume_rejected():
    with pytest.raises(ValidationError):
        AiSignalCandidate(**make_valid_candidate(suggested_volume=-1.0))


def test_zero_volume_rejected():
    with pytest.raises(ValidationError):
        AiSignalCandidate(**make_valid_candidate(suggested_volume=0.0))


def test_naive_datetime_rejected():
    """generated_at must be timezone-aware."""
    with pytest.raises(ValidationError, match="timezone-aware"):
        AiSignalCandidate(**make_valid_candidate(generated_at=datetime.now()))  # no tz


def test_model_version_required():
    data = make_valid_candidate()
    del data["model_version"]
    with pytest.raises(ValidationError):
        AiSignalCandidate(**data)


def test_signal_id_auto_generated():
    candidate = AiSignalCandidate(**make_valid_candidate())
    assert candidate.signal_id is not None
    assert len(candidate.signal_id) == 36  # UUID format
