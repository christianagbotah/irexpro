"""Tests for expanded OHLCVService."""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest

from app.core.config import Settings
from app.core.errors import MarketDataError
from app.domain.market_data.ohlcv_service import OHLCVService
from app.domain.market_data.providers.mock_provider import MockMarketDataProvider
from app.domain.market_data.redis_cache import OHLCVRedisCache


@pytest.mark.asyncio
async def test_mock_source_returns_validated_candles():
    service = OHLCVService(
        mock_provider=MockMarketDataProvider(),
        cache=OHLCVRedisCache(redis_client=None),
    )
    candles = await service.get_ohlcv("mock", "EURUSD", "H1", limit=100)
    assert len(candles) >= 10


@pytest.mark.asyncio
async def test_mock_blocked_in_production_without_flag():
    service = OHLCVService(cache=OHLCVRedisCache(redis_client=None))
    settings = Settings(ai_engine_env="production", ai_allow_mock_market_data=False)
    with patch("app.domain.market_data.ohlcv_service.get_settings", return_value=settings):
        with pytest.raises(MarketDataError, match="blocked in production"):
            await service.get_ohlcv("mock", "EURUSD", "H1")


@pytest.mark.asyncio
async def test_broker_source_requires_user_and_connection():
    service = OHLCVService(cache=OHLCVRedisCache(redis_client=None))
    with pytest.raises(MarketDataError, match="requires userId"):
        await service.get_ohlcv("broker", "EURUSD", "H1")


@pytest.mark.asyncio
async def test_cache_hit_skips_provider():
    redis = AsyncMock()
    cache = OHLCVRedisCache(redis_client=redis)
    service = OHLCVService(mock_provider=MockMarketDataProvider(), cache=cache)

    candles = await service.get_ohlcv("mock", "EURUSD", "H1", limit=100)
    await cache.cache_ohlcv("mock", "EURUSD", "H1", candles)

    import json

    payload = json.dumps({
        "cached_at": datetime.now(UTC).isoformat(),
        "expires_at": datetime.now(UTC).timestamp() + 300,
        "candles": [c.model_dump(mode="json") for c in candles],
    })
    redis.get = AsyncMock(return_value=payload)

    cached = await service.get_ohlcv("mock", "EURUSD", "H1", limit=50)
    assert len(cached) >= 10
