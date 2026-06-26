"""
MockMarketDataProvider — deterministic synthetic OHLCV data for development and testing.

╔══════════════════════════════════════════════════════════════════════╗
║  WARNING: THIS IS MOCK/TEST DATA ONLY                               ║
║  It does NOT represent real market prices or conditions.            ║
║  It does NOT imply any trading edge or profitability.               ║
║  It MUST NOT be used for live trading decisions.                    ║
╚══════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta

from app.domain.market_data.providers.base import MarketDataProvider
from app.domain.market_data.schemas import OHLCVCandle

# Seeded base prices per instrument — fixed for determinism
MOCK_BASE_PRICES: dict[str, float] = {
    "EURUSD": 1.08500,
    "GBPUSD": 1.27200,
    "USDJPY": 149.500,
    "AUDUSD": 0.65800,
    "USDCAD": 1.36500,
    "USDCHF": 0.88200,
    "NZDUSD": 0.59800,
    "GBPJPY": 189.700,
    "EURJPY": 162.300,
    "EURGBP": 0.85300,
}

# Pip sizes
PIP_SIZE: dict[str, float] = {
    "USDJPY": 0.01,
    "GBPJPY": 0.01,
    "EURJPY": 0.01,
}
DEFAULT_PIP = 0.0001


def _pip(instrument: str) -> float:
    return PIP_SIZE.get(instrument, DEFAULT_PIP)


class MockMarketDataProvider(MarketDataProvider):
    """
    TEST/DEV ONLY market data provider.
    Generates deterministic synthetic OHLCV candles using a simple sine-wave pattern.
    """

    @property
    def provider_name(self) -> str:
        return "mock_test_only"

    def is_available(self) -> bool:
        return True

    async def get_ohlcv(
        self,
        instrument: str,
        timeframe: str,
        limit: int = 100,
    ) -> list[OHLCVCandle]:
        """
        Generate `limit` synthetic OHLCV candles ending at 'now'.
        Pattern is deterministic — same instrument + timeframe always produces same shape.
        """
        base = MOCK_BASE_PRICES.get(instrument.upper(), 1.10000)
        pip = _pip(instrument)
        amplitude_pips = 50
        amplitude = amplitude_pips * pip

        # Candle duration in minutes
        tf_minutes = _timeframe_to_minutes(timeframe)
        now = datetime(2024, 1, 15, 12, 0, 0, tzinfo=UTC)  # Fixed anchor for determinism

        candles: list[OHLCVCandle] = []
        for i in range(limit):
            offset = limit - i - 1
            ts = now - timedelta(minutes=tf_minutes * offset)

            # Sine wave pattern — NOT a real market signal, just test shape
            phase = (i / limit) * 2 * math.pi
            mid = base + amplitude * math.sin(phase)
            candle_range = amplitude * 0.4 * abs(math.cos(phase * 2)) + pip * 5

            open_p = mid + candle_range * 0.1
            close_p = mid - candle_range * 0.1
            high_p = max(open_p, close_p) + candle_range * 0.5
            low_p = min(open_p, close_p) - candle_range * 0.5
            volume = 1000.0 + (i % 20) * 50.0

            candles.append(OHLCVCandle(
                timestamp=ts,
                open=round(open_p, 5),
                high=round(high_p, 5),
                low=round(low_p, 5),
                close=round(close_p, 5),
                volume=volume,
                instrument=instrument.upper(),
                timeframe=timeframe,
                source="mock_test_only",
            ))

        return candles

    async def get_latest_price(self, instrument: str) -> float:
        candles = await self.get_ohlcv(instrument, "H1", limit=1)
        return candles[-1].close


def _timeframe_to_minutes(tf: str) -> int:
    mapping = {
        "M1": 1, "M5": 5, "M15": 15, "M30": 30,
        "H1": 60, "H4": 240, "D1": 1440, "W1": 10080,
    }
    return mapping.get(tf.upper(), 60)
