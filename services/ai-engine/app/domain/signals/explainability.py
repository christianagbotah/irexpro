"""Signal explainability metadata builder."""
from __future__ import annotations


def build_explainability_metadata(
    prediction_explainability: dict,
    features: dict[str, float],
    instrument: str,
    timeframe: str,
) -> dict:
    """
    Build explainability metadata attached to every signal candidate.
    Includes model method, key feature values, and safety notes.
    """
    return {
        "explainability_version": "1.0",
        "model_method": prediction_explainability.get("method", "unknown"),
        "key_features": {
            "price_vs_ma20": round(features.get("price_vs_ma20", 0.0), 6),
            "volatility_10": round(features.get("volatility_10", 0.0), 6),
            "simple_return": round(features.get("simple_return", 0.0), 6),
            "candle_body": round(features.get("candle_body", 0.0), 6),
        },
        "instrument": instrument,
        "timeframe": timeframe,
        "note": prediction_explainability.get(
            "note",
            "Baseline scaffold explainability. Full SHAP values deferred to production model.",
        ),
        "approved_for_live": False,
    }
