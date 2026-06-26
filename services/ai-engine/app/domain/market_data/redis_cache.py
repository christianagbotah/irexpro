"""Redis OHLCV cache service."""
from __future__ import annotations

import json
from datetime import UTC, datetime

from app.core.config import get_settings
from app.core.logging import get_logger
from app.domain.market_data.schemas import OHLCVCandle

logger = get_logger(__name__)


class OHLCVRedisCache:
    """
    Redis-backed cache for OHLCV candles.
    Key format: {prefix}:ohlcv:{source}:{instrument}:{timeframe}

    Fails gracefully: if Redis is unavailable, methods return None/False without raising.
    Never caches secrets or credentials.
    """

    def __init__(self, redis_client=None, ttl_seconds: int | None = None) -> None:
        self._redis = redis_client
        settings = get_settings()
        self._prefix = settings.ai_redis_key_prefix
        self._ttl_seconds = ttl_seconds if ttl_seconds is not None else settings.ai_ohlcv_cache_ttl_seconds

    def build_cache_key(self, source: str, instrument: str, timeframe: str) -> str:
        return (
            f"{self._prefix}:ohlcv:{source.lower()}:"
            f"{instrument.upper()}:{timeframe.upper()}"
        )

    async def cache_ohlcv(
        self,
        source: str,
        instrument: str,
        timeframe: str,
        candles: list[OHLCVCandle],
        ttl_seconds: int | None = None,
    ) -> bool:
        """Store candles in Redis with optional stale-while-refresh metadata."""
        if self._redis is None:
            return False
        try:
            key = self.build_cache_key(source, instrument, timeframe)
            now = datetime.now(UTC)
            ttl = ttl_seconds if ttl_seconds is not None else self._ttl_seconds
            payload = {
                "cached_at": now.isoformat(),
                "expires_at": now.timestamp() + ttl,
                "candles": [c.model_dump(mode="json") for c in candles],
            }
            data = json.dumps(payload, default=str)
            await self._redis.set(key, data, ex=ttl)
            logger.debug(
                "OHLCV cached",
                source=source,
                instrument=instrument,
                timeframe=timeframe,
                count=len(candles),
            )
            return True
        except Exception as e:
            logger.warning("Redis cache write failed", error=str(e))
            return False

    async def get_cached_ohlcv(
        self,
        source: str,
        instrument: str,
        timeframe: str,
    ) -> list[OHLCVCandle] | None:
        """Retrieve candles from Redis. Returns None if not found or Redis unavailable."""
        if self._redis is None:
            return None
        try:
            key = self.build_cache_key(source, instrument, timeframe)
            raw = await self._redis.get(key)
            if raw is None:
                logger.debug(
                    "OHLCV cache miss",
                    source=source,
                    instrument=instrument,
                    timeframe=timeframe,
                )
                return None

            payload = json.loads(raw)
            candles_data = payload.get("candles", payload)
            candles = [OHLCVCandle(**d) for d in candles_data]
            logger.debug(
                "OHLCV cache hit",
                source=source,
                instrument=instrument,
                timeframe=timeframe,
                count=len(candles),
            )
            return candles
        except Exception as e:
            logger.warning("Redis cache read failed", error=str(e))
            return None
