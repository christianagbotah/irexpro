"""
Backtesting schemas — input/output types for the backtest engine.

IMPORTANT:
- simulatedOnly is always True — results are never real trading performance.
- Do NOT present results as future profit guarantees.
- All monetary boundary values use strings for decimal safety.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator, model_validator

MAX_RISK_PER_TRADE_PERCENT = 10.0
MIN_CANDLE_COUNT = 20


class BacktestRequest(BaseModel):
    """
    Input specification for a backtesting run.

    Candles must be sorted oldest-first, no duplicates, no future timestamps.
    riskPerTradePercent is capped at MAX_RISK_PER_TRADE_PERCENT for safety.
    """
    instrument: str = Field(..., min_length=3)
    timeframe: str = "H1"
    start_time: datetime | None = None
    end_time: datetime | None = None
    initial_balance: str = Field(..., description="Initial account balance (decimal string)")
    risk_per_trade_percent: float = Field(
        default=1.0, ge=0.01, le=MAX_RISK_PER_TRADE_PERCENT,
        description="Risk per trade as % of balance (max 10%)"
    )
    spread_pips: float = Field(default=1.0, ge=0.0, description="Simulated spread in pips")
    slippage_pips: float = Field(default=0.5, ge=0.0, description="Simulated slippage in pips")
    strategy_code: str = "baseline-h1"
    model_version: str = "baseline-xgboost-v0.1.0"
    candles: list[dict[str, Any]] | None = Field(
        default=None,
        description="Optional pre-supplied candles. If None, mock data is generated."
    )
    source: Literal["mock", "uploaded"] = "mock"
    mode: Literal["backtest"] = "backtest"

    @field_validator("initial_balance")
    @classmethod
    def validate_initial_balance(cls, v: str) -> str:
        try:
            balance = Decimal(v)
        except Exception:
            raise ValueError("initial_balance must be a valid decimal string")
        if balance <= 0:
            raise ValueError("initial_balance must be positive")
        return v

    @model_validator(mode="after")
    def validate_time_range(self) -> BacktestRequest:
        if self.start_time and self.start_time.tzinfo is None:
            raise ValueError("start_time must be timezone-aware")
        if self.end_time and self.end_time.tzinfo is None:
            raise ValueError("end_time must be timezone-aware")
        if self.start_time and self.end_time and self.start_time >= self.end_time:
            raise ValueError("start_time must be before end_time")
        return self


class TradeResult(BaseModel):
    """
    Result of a single simulated trade.

    simulatedOnly is always True — this is never a real trade.
    """
    trade_id: str = Field(default_factory=lambda: str(uuid4()))
    signal_id: str
    direction: Literal["BUY", "SELL"]
    instrument: str
    entry_time: str
    exit_time: str | None = None
    entry_price: str
    exit_price: str | None = None
    stop_loss: str
    take_profit: str
    volume: float
    realised_pnl: str = "0.00000"
    outcome: Literal["WIN", "LOSS", "BREAKEVEN", "SKIPPED"] = "SKIPPED"
    exit_reason: Literal[
        "TAKE_PROFIT", "STOP_LOSS", "END_OF_DATA", "INVALID_SIGNAL", "CONFIDENCE_TOO_LOW"
    ] = "INVALID_SIGNAL"
    simulated_only: bool = True


class BacktestMetrics(BaseModel):
    """
    Summary metrics for a completed backtest.

    WARNING: These are historical simulation metrics only.
    They do not guarantee future trading performance.
    """
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: str = "0.00"
    gross_profit: str = "0.00000"
    gross_loss: str = "0.00000"
    net_profit: str = "0.00000"
    profit_factor: str = "0.00"
    average_win: str = "0.00000"
    average_loss: str = "0.00000"
    largest_win: str = "0.00000"
    largest_loss: str = "0.00000"
    max_drawdown: str = "0.00000"
    max_drawdown_percent: str = "0.00"
    expectancy_placeholder: str = "0.00000"
    consecutive_wins: int = 0
    consecutive_losses: int = 0
    balance_curve: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=lambda: [
        "SIMULATED RESULTS ONLY — not a guarantee of future performance.",
        "Past simulated performance does not predict live trading outcomes.",
    ])


class BacktestResult(BaseModel):
    """
    Complete backtesting result.

    simulatedOnly is always True.
    Do NOT present these results as live trading performance.
    """
    backtest_id: str = Field(default_factory=lambda: str(uuid4()))
    instrument: str
    timeframe: str
    model_version: str
    strategy_code: str
    simulated_only: bool = True
    started_at: str
    completed_at: str
    initial_balance: str
    final_balance: str
    metrics: BacktestMetrics
    trade_results: list[TradeResult] = Field(default_factory=list)
    candle_count: int = 0
    warnings: list[str] = Field(default_factory=lambda: [
        "SIMULATED RESULTS ONLY — not a guarantee of future performance.",
        "Results are based on historical mock data and simplified simulation assumptions.",
        "No live broker execution occurred.",
    ])
    metadata: dict[str, Any] = Field(default_factory=dict)
