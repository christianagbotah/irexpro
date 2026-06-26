"""Shared pytest fixtures."""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.domain.market_data.ohlcv_service import OHLCVService
from app.domain.market_data.providers.mock_provider import MockMarketDataProvider
from app.domain.market_data.redis_cache import OHLCVRedisCache
from app.domain.models.registry import build_default_registry
from app.domain.scheduler.signal_scheduler import SignalScheduler
from app.domain.signals.signal_generator import SignalGenerator
from app.main import app, app_state


@pytest.fixture(autouse=True)
def setup_app_state():
    """Ensure app_state is populated for all tests (avoids lifespan dependency)."""
    if "registry" not in app_state:
        app_state["registry"] = build_default_registry()
    app_state["redis"] = None
    app_state["scheduler"] = SignalScheduler()
    yield


@pytest.fixture
async def client():
    """Async test client for the FastAPI app."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
def mock_provider():
    return MockMarketDataProvider()


@pytest.fixture
def ohlcv_cache():
    return OHLCVRedisCache(redis_client=None)


@pytest.fixture
def ohlcv_service(mock_provider, ohlcv_cache):
    return OHLCVService(mock_provider=mock_provider, cache=ohlcv_cache)


@pytest.fixture
def registry():
    return build_default_registry()


@pytest.fixture
def signal_generator(ohlcv_service, registry):
    return SignalGenerator(ohlcv_service=ohlcv_service, model_registry=registry)
