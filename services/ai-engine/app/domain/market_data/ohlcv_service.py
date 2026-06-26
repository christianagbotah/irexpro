"""OHLCVService — orchestrates provider + cache."""
from __future__ import annotations

from app.core.logging import get_logger
from app.domain.market_data.providers.base import MarketDataProvider
from app.domain.market_data.redis_cache import OHLCVRedisCache
from app.domain.market_data.schemas import OHLCVCandle

logger = get_logger(__name__)


class OHLCVService:
    """
    Fetches OHLCV candles, with Redis caching.
    Falls back to provider on cache miss.
    Fails gracefully if both cache and provider fail.
    """

    def __init__(self, provider: MarketDataProvider, cache: OHLCVRedisCache) -> None:
        self._provider = provider
        self._cache = cache

    async def get_candles(
        self,
        instrument: str,
        timeframe: str,
        limit: int = 100,
        bypass_cache: bool = False,
    ) -> list[OHLCVCandle]:
        if not bypass_cache:
            cached = await self._cache.get_cached_ohlcv(instrument, timeframe)
            if cached:
                logger.debug("OHLCV cache hit", instrument=instrument, timeframe=timeframe)
                return cached[-limit:]

        candles = await self._provider.get_ohlcv(instrument, timeframe, limit)
        await self._cache.cache_ohlcv(instrument, timeframe, candles)
        return candles
