"""Input validation for backtesting engine."""
from __future__ import annotations

from datetime import UTC, datetime

from app.core.errors import MarketDataError
from app.domain.market_data.schemas import OHLCVCandle

MIN_CANDLE_COUNT = 20


def validate_candles(candles: list[OHLCVCandle]) -> None:
    """
    Validate a candle list for backtesting use.

    Rules enforced:
    - Minimum candle count (MIN_CANDLE_COUNT)
    - No future timestamps
    - No duplicate timestamps
    - Candles must be sorted oldest-first
    """
    if len(candles) < MIN_CANDLE_COUNT:
        raise MarketDataError(
            f"Backtest requires at least {MIN_CANDLE_COUNT} candles, "
            f"got {len(candles)}"
        )

    now = datetime.now(UTC)
    seen: set[datetime] = set()
    prev_ts: datetime | None = None

    for i, candle in enumerate(candles):
        ts = candle.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=UTC)

        if ts > now:
            raise MarketDataError(
                f"Candle at index {i} has a future timestamp: {ts.isoformat()}"
            )

        if ts in seen:
            raise MarketDataError(
                f"Duplicate candle timestamp at index {i}: {ts.isoformat()}"
            )
        seen.add(ts)

        if prev_ts is not None and ts < prev_ts:
            raise MarketDataError(
                f"Candles are not sorted: candle at index {i} ({ts.isoformat()}) "
                f"is older than previous ({prev_ts.isoformat()})"
            )
        prev_ts = ts
