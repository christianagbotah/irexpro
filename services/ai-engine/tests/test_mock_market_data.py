"""Tests for MockMarketDataProvider."""
from __future__ import annotations

import pytest

from app.domain.market_data.providers.mock_provider import MockMarketDataProvider


@pytest.mark.asyncio
async def test_mock_provider_returns_correct_count():
    provider = MockMarketDataProvider()
    candles = await provider.get_ohlcv("EURUSD", "H1", limit=50)
    assert len(candles) == 50


@pytest.mark.asyncio
async def test_mock_provider_is_deterministic():
    """Same call twice should return identical data."""
    provider = MockMarketDataProvider()
    candles1 = await provider.get_ohlcv("EURUSD", "H1", limit=20)
    candles2 = await provider.get_ohlcv("EURUSD", "H1", limit=20)
    assert [c.close for c in candles1] == [c.close for c in candles2]


@pytest.mark.asyncio
async def test_mock_provider_timestamps_are_ordered():
    provider = MockMarketDataProvider()
    candles = await provider.get_ohlcv("EURUSD", "H1", limit=30)
    timestamps = [c.timestamp for c in candles]
    assert timestamps == sorted(timestamps)


@pytest.mark.asyncio
async def test_mock_provider_source_is_labelled_mock():
    """Source must clearly identify as mock/test data."""
    provider = MockMarketDataProvider()
    candles = await provider.get_ohlcv("EURUSD", "H1", limit=5)
    for candle in candles:
        assert "mock" in candle.source.lower() or "test" in candle.source.lower()


@pytest.mark.asyncio
async def test_mock_provider_high_above_low():
    provider = MockMarketDataProvider()
    candles = await provider.get_ohlcv("GBPUSD", "M15", limit=20)
    for c in candles:
        assert c.high >= c.low, f"high={c.high} < low={c.low}"


@pytest.mark.asyncio
async def test_mock_provider_is_available():
    provider = MockMarketDataProvider()
    assert provider.is_available() is True


@pytest.mark.asyncio
async def test_mock_provider_returns_timezone_aware_timestamps():
    provider = MockMarketDataProvider()
    candles = await provider.get_ohlcv("USDJPY", "H4", limit=10)
    for c in candles:
        assert c.timestamp.tzinfo is not None
