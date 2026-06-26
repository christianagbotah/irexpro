"""Time-ordered train/validation split for offline training."""
from __future__ import annotations

import pandas as pd


def time_ordered_split(
    df: pd.DataFrame,
    train_ratio: float = 0.8,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Split dataset by time order — never shuffle.
    First train_ratio rows go to train; remainder to validation.
    """
    if not 0.0 < train_ratio < 1.0:
        raise ValueError("train_ratio must be between 0 and 1")
    if len(df) < 2:
        raise ValueError("Dataset too small for split")

    split_idx = int(len(df) * train_ratio)
    if split_idx < 1 or split_idx >= len(df):
        raise ValueError("Split produced empty train or validation set")

    train = df.iloc[:split_idx].copy()
    val = df.iloc[split_idx:].copy()
    return train, val


def compute_validation_metrics_placeholder(y_true: pd.Series, y_pred: pd.Series) -> dict[str, float]:
    """
    Placeholder metrics for offline research — not performance claims.
    """
    accuracy = float((y_true == y_pred).mean()) if len(y_true) else 0.0
    return {
        "accuracy_placeholder": accuracy,
        "sample_count": float(len(y_true)),
    }
