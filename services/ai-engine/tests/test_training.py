"""Tests for offline training scaffold."""
from __future__ import annotations

import pandas as pd

from app.domain.training.dataset_builder import detect_future_leakage
from app.domain.training.train_xgboost import default_model_artifact_path
from app.domain.training.validation import time_ordered_split


def test_time_ordered_split():
    df = pd.DataFrame({"value": list(range(10))})
    train, val = time_ordered_split(df, train_ratio=0.8)
    assert len(train) == 8
    assert len(val) == 2
    assert train["value"].max() < val["value"].min()


def test_rejects_dataset_with_leakage_indicators():
    feature_df = pd.DataFrame({"target_index": [2, 1, 0]})
    assert detect_future_leakage(feature_df) is True


def test_model_artifact_path_generated_safely():
    path = default_model_artifact_path("offline-xgboost-research")
    assert str(path).startswith("models")
    assert ".." not in str(path)


def test_live_approval_remains_false():
    from app.domain.models.governance import create_baseline_governance

    governance = create_baseline_governance()
    assert governance.approved_for_live is False
