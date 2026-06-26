"""
Offline XGBoost training script — research only.

Run manually: python -m app.domain.training.train_xgboost --dataset path/to/data.csv

IMPORTANT:
- Never runs at application startup
- Saved models are paper-only by default
- No live trading approval
"""
from __future__ import annotations

import argparse
from pathlib import Path

from app.domain.models.schemas import ModelGovernanceMetadata
from app.domain.training.dataset_builder import build_feature_rows, load_ohlcv_csv
from app.domain.training.validation import (
    compute_validation_metrics_placeholder,
    time_ordered_split,
)


def default_model_artifact_path(model_version: str) -> Path:
    """Generate safe artifact path under services/ai-engine/models/."""
    safe_version = model_version.replace("/", "_").replace("\\", "_")
    return Path("models") / f"{safe_version}.json"


def train_offline(dataset_path: str, model_version: str = "offline-xgboost-research") -> dict:
    """
    Build features, split by time, and optionally save a research artifact.
    Does NOT approve model for live trading.
    """
    df = load_ohlcv_csv(dataset_path)
    features = build_feature_rows(df)
    train_df, val_df = time_ordered_split(features)

    # Placeholder labels for scaffold — real labels defined in future sprints
    val_labels = (val_df.get("price_vs_ma20", 0) > 0).astype(int)
    val_pred = (val_df.get("price_vs_ma20", 0) > 0).astype(int)

    metrics = compute_validation_metrics_placeholder(val_labels, val_pred)
    governance = ModelGovernanceMetadata(
        model_version=model_version,
        approved_for_paper=False,
        approved_for_live=False,
        notes="Offline research artifact — not approved for live trading",
    )

    return {
        "model_version": model_version,
        "train_rows": len(train_df),
        "validation_rows": len(val_df),
        "metrics": metrics,
        "artifact_path": str(default_model_artifact_path(model_version)),
        "approved_for_live": governance.approved_for_live,
        "approved_for_paper": governance.approved_for_paper,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Offline XGBoost training scaffold (research only)")
    parser.add_argument("--dataset", required=True, help="Path to OHLCV CSV dataset")
    parser.add_argument("--model-version", default="offline-xgboost-research")
    args = parser.parse_args()
    result = train_offline(args.dataset, args.model_version)
    print(result)


if __name__ == "__main__":
    main()
