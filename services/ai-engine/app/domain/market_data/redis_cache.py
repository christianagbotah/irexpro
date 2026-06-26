"""Redis OHLCV cache service."""
from __future__ import annotations

import json

from app.core.logging import get_logger
from app.domain.market_data.schemas import OHLCVCandle

logger = get_logger(__name__)

CACHE_KEY_PREFIX = "irexpro:ai:ohlcv"
DEFAULT_TTL_SECONDS = 300  # 5 minutes


class OHLCVRedisCache:
    """
    Redis-backed cache for OHLCV candles.
    Uses a separate Redis DB (configured via REDIS_DB) from the main API.

    Fails gracefully: if Redis is unavailable, methods return None/empty without raising.
    Never caches secrets or credentials.
    """

    def __init__(self, redis_client=None) -> None:
        self._redis = redis_client

    def build_cache_key(self, instrument: str, timeframe: str) -> str:
        return f"{CACHE_KEY_PREFIX}:{instrument.upper()}:{timeframe.upper()}"

    async def cache_ohlcv(
        self,
        instrument: str,
        timeframe: str,
        candles: list[OHLCVCandle],
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
    ) -> bool:
        """Store candles in Redis. Returns True on success, False on failure."""
        if self._redis is None:
            return False
        try:
            key = self.build_cache_key(instrument, timeframe)
            data = json.dumps([c.model_dump(mode="json") for c in candles], default=str)
            await self._redis.set(key, data, ex=ttl_seconds)
            logger.debug("OHLCV cached", instrument=instrument, timeframe=timeframe, count=len(candles))
            return True
        except Exception as e:
            logger.warning("Redis cache write failed", error=str(e))
            return False

    async def get_cached_ohlcv(
        self,
        instrument: str,
        timeframe: str,
    ) -> list[OHLCVCandle] | None:
        """Retrieve candles from Redis. Returns None if not found or Redis unavailable."""
        if self._redis is None:
            return None
        try:
            key = self.build_cache_key(instrument, timeframe)
            raw = await self._redis.get(key)
            if raw is None:
                return None
            data = json.loads(raw)
            return [OHLCVCandle(**d) for d in data]
        except Exception as e:
            logger.warning("Redis cache read failed", error=str(e))
            return None
