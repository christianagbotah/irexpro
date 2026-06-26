"""
Backtest API endpoints.

SAFETY RULES:
- Backtest endpoints NEVER publish signals to NestJS.
- Backtest endpoints NEVER call broker execution.
- Backtest endpoints NEVER call NestJsClient.publish_signal().
- Backtest results are always marked simulatedOnly=True.
- Mock backtests are blocked in production unless AI_ALLOW_MOCK_MARKET_DATA=true.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.domain.backtesting.backtest_engine import BacktestEngine
from app.domain.backtesting.schemas import BacktestRequest, BacktestResult

router = APIRouter()


def _get_engine() -> BacktestEngine:
    from app.main import app_state
    return BacktestEngine(registry=app_state["registry"])


@router.post(
    "/backtests/run",
    response_model=BacktestResult,
    tags=["Backtesting"],
)
async def run_backtest(request: BacktestRequest) -> BacktestResult:
    """
    Run an isolated backtest simulation.

    **SIMULATED RESULTS ONLY.** No real trades are placed.
    Results must not be interpreted as future performance guarantees.

    - Uses mock or uploaded OHLCV data only.
    - Never calls the broker or NestJS execution pipeline.
    - Returns a complete BacktestResult with simulatedOnly=True.
    """
    settings = get_settings()

    if settings.is_production and not settings.ai_allow_mock_market_data:
        raise HTTPException(
            status_code=403,
            detail="Backtest with mock data is blocked in production. "
                   "Set AI_ALLOW_MOCK_MARKET_DATA=true to enable.",
        )

    engine = _get_engine()
    try:
        result = await engine.run(request)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    return result


@router.get(
    "/backtests/sample-report",
    response_model=BacktestResult,
    tags=["Backtesting"],
)
async def get_sample_report() -> BacktestResult:
    """
    Return a deterministic sample backtest report using mock OHLCV data.

    **SIMULATED RESULTS ONLY.** For demonstration and integration testing only.
    """
    settings = get_settings()
    if settings.is_production and not settings.ai_allow_mock_market_data:
        raise HTTPException(
            status_code=403,
            detail="Sample report is not available in production.",
        )

    engine = _get_engine()
    request = BacktestRequest(
        instrument="EURUSD",
        timeframe="H1",
        initial_balance="10000.00",
        risk_per_trade_percent=1.0,
        spread_pips=1.0,
        slippage_pips=0.5,
        strategy_code="baseline-h1",
        model_version="baseline-xgboost-v0.1.0",
        source="mock",
        mode="backtest",
    )
    try:
        result = await engine.run(request)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    return result
