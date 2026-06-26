"""Abstract base class for market data providers."""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.domain.market_data.schemas import OHLCVCandle


class MarketDataProvider(ABC):
    """Interface that all market data providers must implement."""

    @abstractmethod
    async def get_ohlcv(
        self,
        instrument: str,
        timeframe: str,
        limit: int = 100,
    ) -> list[OHLCVCandle]:
        """Fetch OHLCV candles for an instrument."""
        ...

    @abstractmethod
    async def get_latest_price(self, instrument: str) -> float:
        """Get the most recent close price for an instrument."""
        ...

    @abstractmethod
    def is_available(self) -> bool:
        """Check whether the provider can serve data (connectivity check)."""
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Human-readable provider identifier."""
        ...
