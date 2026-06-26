"""
Model governance utilities.

RULES:
- No model is approved for live trading by default.
- Baseline model is paper/sandbox only.
- Live approval must go through a future governance workflow.
"""
from __future__ import annotations

from app.domain.models.baseline_xgboost import MODEL_VERSION as BASELINE_VERSION
from app.domain.models.schemas import ModelGovernanceMetadata


def create_baseline_governance() -> ModelGovernanceMetadata:
    """Return the governance record for the baseline XGBoost scaffold."""
    return ModelGovernanceMetadata(
        model_version=BASELINE_VERSION,
        training_data_source="none_synthetic_placeholder",
        validation_status="scaffold_only_not_validated",
        approved_for_paper=True,
        approved_for_sandbox=False,
        approved_for_live=False,  # NEVER true without governance review
        notes=(
            "Baseline scaffold model. No real training data used. "
            "Approved for paper mode only. "
            "Live trading approval requires full governance review by quant team + legal."
        ),
        feature_list=[
            "simple_return", "ma_5", "ma_10", "ma_20",
            "price_vs_ma20", "volatility_10", "candle_body", "hl_range", "volume_change",
        ],
    )
