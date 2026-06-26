"""
Offline dataset builder — research/training only.

IMPORTANT:
- Not invoked at application startup
- No live model approval
- Features must not use future candle data (no lookahead leakage)
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from app.domain.models.feature_engineering import candles_to_dataframe, extract_latest_features


def load_ohlcv_csv(path: str | Path) -> pd.DataFrame:
    """Load historical OHLCV CSV with columns: timestamp, open, high, low, close, volume."""
    df = pd.read_csv(path, parse_dates=["timestamp"])
    required = {"timestamp", "open", "high", "low", "close", "volume"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Dataset missing columns: {sorted(missing)}")
    return df.sort_values("timestamp").reset_index(drop=True)


def build_feature_rows(df: pd.DataFrame, min_history: int = 20) -> pd.DataFrame:
    """
    Build feature rows using only data available up to each candle (no lookahead).
    Each row uses candles[0:i+1] only — features at index i never see candle i+1.
    """
    rows: list[dict] = []
    for i in range(min_history, len(df)):
        window = df.iloc[: i + 1]
        candle_df = candles_to_dataframe_from_df(window)
        features = extract_latest_features(candle_df)
        features["target_index"] = i
        features["timestamp"] = df.iloc[i]["timestamp"]
        rows.append(features)
    return pd.DataFrame(rows)


def candles_to_dataframe_from_df(df: pd.DataFrame) -> pd.DataFrame:
    """Convert OHLCV dataframe to feature-engineering compatible format."""
    from app.domain.market_data.schemas import OHLCVCandle

    candles = [
        OHLCVCandle(
            timestamp=row["timestamp"].to_pydatetime() if hasattr(row["timestamp"], "to_pydatetime") else row["timestamp"],
            open=float(row["open"]),
            high=float(row["high"]),
            low=float(row["low"]),
            close=float(row["close"]),
            volume=float(row["volume"]),
            instrument="EURUSD",
            timeframe="H1",
            source="offline",
        )
        for _, row in df.iterrows()
    ]
    return candles_to_dataframe(candles)


def detect_future_leakage(feature_df: pd.DataFrame) -> bool:
    """
    Heuristic: if target_index is not monotonically aligned with row order, flag leakage risk.
    Returns True if a potential leakage indicator is detected.
    """
    if "target_index" not in feature_df.columns:
        return True
    indices = feature_df["target_index"].tolist()
    return indices != sorted(indices)
