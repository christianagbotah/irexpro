"""Tests for OHLCVRedisCache."""
from __future__ import annotations

import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from app.domain.market_data.redis_cache import OHLCVRedisCache
from app.domain.market_data.schemas import OHLCVCandle


def make_candle(ts: datetime | None = None) -> OHLCVCandle:
    return OHLCVCandle(
        timestamp=ts or datetime(2024, 1, 1, tzinfo=UTC),
        open=1.1,
        high=1.11,
        low=1.09,
        close=1.105,
        volume=1000.0,
        instrument="EURUSD",
        timeframe="H1",
        source="mock",
    )


def test_key_format():
    cache = OHLCVRedisCache(redis_client=None, ttl_seconds=300)
    key = cache.build_cache_key("mock", "eurusd", "h1")
    assert key == "ai:ohlcv:mock:EURUSD:H1"


@pytest.mark.asyncio
async def test_cache_write_and_read():
    redis = AsyncMock()
    cache = OHLCVRedisCache(redis_client=redis, ttl_seconds=60)
    candles = [make_candle()]

    await cache.cache_ohlcv("mock", "EURUSD", "H1", candles)
    redis.set.assert_called_once()
    key = redis.set.call_args[0][0]
    payload = redis.set.call_args[0][1]
    assert key == "ai:ohlcv:mock:EURUSD:H1"
    data = json.loads(payload)
    assert "candles" in data
    assert "cached_at" in data
    assert "apiKey" not in payload
    assert "password" not in payload

    redis.get = AsyncMock(return_value=payload)
    result = await cache.get_cached_ohlcv("mock", "EURUSD", "H1")
    assert result is not None
    assert len(result) == 1


@pytest.mark.asyncio
async def test_missing_cache_returns_none():
    redis = AsyncMock()
    redis.get = AsyncMock(return_value=None)
    cache = OHLCVRedisCache(redis_client=redis)
    assert await cache.get_cached_ohlcv("mock", "EURUSD", "H1") is None


@pytest.mark.asyncio
async def test_redis_unavailable_handled_safely():
    cache = OHLCVRedisCache(redis_client=None)
    assert await cache.get_cached_ohlcv("mock", "EURUSD", "H1") is None
    assert await cache.cache_ohlcv("mock", "EURUSD", "H1", [make_candle()]) is False


@pytest.mark.asyncio
async def test_no_secrets_in_cached_payload():
    redis = AsyncMock()
    cache = OHLCVRedisCache(redis_client=redis)
    candles = [make_candle()]
    await cache.cache_ohlcv("broker", "EURUSD", "H1", candles)
    payload = redis.set.call_args[0][1]
    assert "api_key" not in payload.lower()
    assert "secret" not in payload.lower()
