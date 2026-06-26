"""
Builds a complete BacktestResult from engine components.

IMPORTANT:
- All BacktestResult instances are clearly marked simulatedOnly=True.
- Results must never be presented as live trading performance.
"""
from __future__ import annotations

from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from app.domain.backtesting.metrics import calculate_metrics
from app.domain.backtesting.schemas import BacktestRequest, BacktestResult, TradeResult


def build_report(
    request: BacktestRequest,
    trades: list[TradeResult],
    started_at: datetime,
    completed_at: datetime | None = None,
) -> BacktestResult:
    """
    Assemble a BacktestResult from the trade list.

    final_balance is derived from initial_balance + sum of realised_pnl.
    All monetary values are decimal-safe strings.
    """
    now = completed_at or datetime.now(UTC)
    initial = Decimal(request.initial_balance)
    executed = [t for t in trades if t.outcome != "SKIPPED"]
    net = sum((Decimal(t.realised_pnl) for t in executed), Decimal("0"))
    final = (initial + net).quantize(Decimal("0.00001"), ROUND_HALF_UP)

    metrics = calculate_metrics(trades, request.initial_balance)
    candle_count = len(request.candles) if request.candles else 0

    return BacktestResult(
        instrument=request.instrument.upper(),
        timeframe=request.timeframe.upper(),
        model_version=request.model_version,
        strategy_code=request.strategy_code,
        simulated_only=True,
        started_at=started_at.isoformat(),
        completed_at=now.isoformat(),
        initial_balance=request.initial_balance,
        final_balance=str(final),
        metrics=metrics,
        trade_results=trades,
        candle_count=candle_count,
        warnings=[
            "SIMULATED RESULTS ONLY — not a guarantee of future performance.",
            "Results are based on historical mock/uploaded data and simplified simulation.",
            "No live broker execution occurred.",
            f"Spread assumption: {request.spread_pips} pips. Slippage assumption: {request.slippage_pips} pips.",
            "Same-candle SL/TP: stop-loss is assumed to trigger first (conservative assumption).",
        ],
        metadata={
            "source": request.source,
            "spread_pips": request.spread_pips,
            "slippage_pips": request.slippage_pips,
            "risk_per_trade_percent": request.risk_per_trade_percent,
        },
    )
