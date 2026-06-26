"""Model metadata and governance schemas."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ModelGovernanceMetadata(BaseModel):
    """
    Governance record for an AI model version.

    RULES:
    - No model is approved for live trading by default.
    - Baseline model is approved for paper/sandbox mode only.
    - Live trading approval requires a future governance workflow with admin + legal review.
    """
    model_version: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    training_data_source: str = "none"
    validation_status: str = "not_validated"

    # Paper/sandbox approval (default for baseline)
    approved_for_paper: bool = False
    approved_for_sandbox: bool = False

    # Live trading requires explicit sign-off — NEVER true for baseline
    approved_for_live: bool = False
    live_approval_reason: str | None = None
    approved_by: str | None = None

    notes: str = ""
    feature_list: list[str] = Field(default_factory=list)
    extra_metadata: dict[str, Any] = Field(default_factory=dict)


class ModelPrediction(BaseModel):
    """Output of a model inference call."""
    direction: Literal["BUY", "SELL"]
    confidence_score: float
    model_version: str
    features_used: list[str]
    raw_scores: dict[str, float] = Field(default_factory=dict)
    explainability: dict[str, Any] = Field(default_factory=dict)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
