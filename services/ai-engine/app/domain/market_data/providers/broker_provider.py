"""
BrokerMarketDataProvider — PLACEHOLDER only.

Real broker market data integration is deferred to Sprint 8+.
All live data calls raise NotImplementedError until the adapter is built.
"""
from __future__ import annotations

from app.domain.market_data.providers.base import MarketDataProvider
from app.domain.market_data.schemas import OHLCVCandle


class BrokerMarketDataProvider(MarketDataProvider):
    """
    PLACEHOLDER — not yet implemented.
    Will connect to the MetaAPI broker adapter in a future sprint.
    """

    @property
    def provider_name(self) -> str:
        return "broker_placeholder"

    def is_available(self) -> bool:
        return False

    async def get_ohlcv(
        self,
        instrument: str,
        timeframe: str,
        limit: int = 100,
    ) -> list[OHLCVCandle]:
        raise NotImplementedError(
            "BrokerMarketDataProvider is not yet implemented. "
            "Use MockMarketDataProvider for development."
        )

    async def get_latest_price(self, instrument: str) -> float:
        raise NotImplementedError("BrokerMarketDataProvider.get_latest_price is not implemented.")
