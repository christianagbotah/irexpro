"""Market data endpoints — mock OHLCV only in this sprint."""
from __future__ import annotations

from fastapi import APIRouter

from app.domain.market_data.providers.mock_provider import MockMarketDataProvider
from app.domain.market_data.schemas import OHLCVRequest, OHLCVResponse

router = APIRouter()


@router.post("/market-data/mock-ohlcv", response_model=OHLCVResponse, tags=["Market Data"])
async def get_mock_ohlcv(request: OHLCVRequest) -> OHLCVResponse:
    """
    Return deterministic mock OHLCV candles for development and testing.

    WARNING: This is MOCK DATA only. It does not represent real market conditions
    and must not be used for live trading decisions.
    """
    provider = MockMarketDataProvider()
    candles = await provider.get_ohlcv(request.instrument, request.timeframe, request.limit)
    return OHLCVResponse(
        instrument=request.instrument.upper(),
        timeframe=request.timeframe,
        candles=candles,
        source="mock_test_only",
        count=len(candles),
    )
