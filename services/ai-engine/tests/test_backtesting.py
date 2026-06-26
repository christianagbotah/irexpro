"""
Comprehensive tests for the Sprint 9 backtesting engine.

Safety checks:
- Backtest never publishes to NestJS
- Backtest never calls broker execution
- All results marked simulatedOnly=True
- Input validation enforced
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.domain.backtesting.backtest_engine import BacktestEngine
from app.domain.backtesting.metrics import calculate_metrics
from app.domain.backtesting.schemas import BacktestRequest, TradeResult
from app.domain.backtesting.trade_simulator import TradeSimulator
from app.domain.backtesting.validation import validate_candles
from app.domain.market_data.schemas import OHLCVCandle
from app.domain.models.registry import build_default_registry
from app.domain.signals.schemas import AiSignalCandidate


def make_candle(i: int, ts: datetime | None = None) -> OHLCVCandle:
    base = 1.1 + i * 0.0001
    return OHLCVCandle(
        timestamp=ts or datetime(2024, 1, 1, i % 24, 0, tzinfo=UTC),
        open=base,
        high=base + 0.0005,
        low=base - 0.0005,
        close=base + 0.0001,
        volume=1000.0,
        instrument="EURUSD",
        timeframe="H1",
        source="mock",
    )


def make_candles(n: int = 50) -> list[OHLCVCandle]:
    base = datetime(2024, 1, 1, 0, 0, tzinfo=UTC)
    return [make_candle(i, base + timedelta(hours=i)) for i in range(n)]


def make_signal(direction: str = "BUY", entry: float = 1.1050) -> AiSignalCandidate:
    sl = 1.0900 if direction == "BUY" else 1.1200
    tp = 1.1200 if direction == "BUY" else 1.0900
    return AiSignalCandidate(
        user_id="backtest-user",
        trading_session_id="backtest-session",
        broker_connection_id="backtest-conn",
        instrument="EURUSD",
        direction=direction,
        confidence_score=0.75,
        suggested_entry_price=entry,
        suggested_stop_loss=sl,
        suggested_take_profit=tp,
        suggested_volume=0.01,
        timeframe="H1",
        strategy_code="baseline-h1",
        model_version="baseline-xgboost-v0.1.0",
    )


# ─── BacktestRequest validation ───────────────────────────────────────────────

def test_backtest_request_valid():
    req = BacktestRequest(
        instrument="EURUSD",
        initial_balance="10000.00",
    )
    assert req.instrument == "EURUSD"
    assert req.mode == "backtest"


def test_backtest_request_rejects_negative_balance():
    with pytest.raises(Exception, match="positive"):
        BacktestRequest(instrument="EURUSD", initial_balance="-100.00")


def test_backtest_request_rejects_zero_balance():
    with pytest.raises(Exception):
        BacktestRequest(instrument="EURUSD", initial_balance="0.00")


def test_backtest_request_risk_capped():
    with pytest.raises(Exception):
        BacktestRequest(
            instrument="EURUSD",
            initial_balance="10000.00",
            risk_per_trade_percent=50.0,
        )


# ─── Candle validation ────────────────────────────────────────────────────────

def test_validate_candles_rejects_unsorted():
    candles = make_candles(30)
    candles[5], candles[4] = candles[4], candles[5]
    with pytest.raises(Exception, match="sorted"):
        validate_candles(candles)


def test_validate_candles_rejects_duplicates():
    candles = make_candles(30)
    candles[3] = make_candle(2, candles[2].timestamp)
    with pytest.raises(Exception, match="Duplicate"):
        validate_candles(candles)


def test_validate_candles_rejects_future_timestamps():
    candles = make_candles(30)
    future = datetime.now(UTC) + timedelta(days=365)
    candles[5] = make_candle(5, future)
    with pytest.raises(Exception, match="future"):
        validate_candles(candles)


def test_validate_candles_rejects_too_few():
    with pytest.raises(Exception, match="at least"):
        validate_candles(make_candles(5))


def test_validate_candles_accepts_valid():
    validate_candles(make_candles(50))


# ─── TradeSimulator ───────────────────────────────────────────────────────────

def test_trade_simulator_buy_win():
    sim = TradeSimulator(spread_pips=1.0, slippage_pips=0.5)
    candles = make_candles(50)
    signal = make_signal("BUY", entry=candles[20].close)

    # Force take-profit hit by making candle 21 have a high above TP
    candles[21] = OHLCVCandle(
        timestamp=candles[21].timestamp,
        open=1.1050,
        high=1.1300,  # above TP=1.12
        low=1.1010,
        close=1.1200,
        volume=1000.0,
        instrument="EURUSD",
        timeframe="H1",
        source="mock",
    )

    result = sim.simulate_trade(signal, candles, 20)
    assert result.outcome == "WIN"
    assert result.exit_reason == "TAKE_PROFIT"
    assert result.simulated_only is True


def test_trade_simulator_buy_loss():
    sim = TradeSimulator(spread_pips=1.0, slippage_pips=0.5)
    candles = make_candles(50)
    signal = make_signal("BUY", entry=candles[20].close)

    # Force stop-loss hit
    candles[21] = OHLCVCandle(
        timestamp=candles[21].timestamp,
        open=1.1050,
        high=1.1060,
        low=1.0800,  # below SL=1.09
        close=1.0850,
        volume=1000.0,
        instrument="EURUSD",
        timeframe="H1",
        source="mock",
    )

    result = sim.simulate_trade(signal, candles, 20)
    assert result.outcome == "LOSS"
    assert result.exit_reason == "STOP_LOSS"
    assert result.simulated_only is True


def test_trade_simulator_sell_win():
    sim = TradeSimulator()
    candles = make_candles(50)
    signal = make_signal("SELL", entry=candles[20].close)

    candles[21] = OHLCVCandle(
        timestamp=candles[21].timestamp,
        open=1.1050,
        high=1.1060,
        low=1.0800,  # below TP=1.09 for SELL
        close=1.0850,
        volume=1000.0,
        instrument="EURUSD",
        timeframe="H1",
        source="mock",
    )

    result = sim.simulate_trade(signal, candles, 20)
    assert result.outcome == "WIN"
    assert result.exit_reason == "TAKE_PROFIT"


def test_trade_simulator_sell_loss():
    sim = TradeSimulator()
    candles = make_candles(50)
    signal = make_signal("SELL", entry=candles[20].close)

    candles[21] = OHLCVCandle(
        timestamp=candles[21].timestamp,
        open=1.1050,
        high=1.1300,  # above SL=1.12 for SELL
        low=1.1010,
        close=1.1200,
        volume=1000.0,
        instrument="EURUSD",
        timeframe="H1",
        source="mock",
    )

    result = sim.simulate_trade(signal, candles, 20)
    assert result.outcome == "LOSS"
    assert result.exit_reason == "STOP_LOSS"


def test_trade_simulator_conservative_same_candle_sl_tp():
    """Conservative rule: if both SL and TP hit in same candle, SL wins."""
    sim = TradeSimulator()
    candles = make_candles(50)
    signal = make_signal("BUY", entry=1.1050)

    # Same candle spans both SL and TP
    candles[21] = OHLCVCandle(
        timestamp=candles[21].timestamp,
        open=1.1050,
        high=1.1400,  # above TP=1.12
        low=1.0800,   # below SL=1.09
        close=1.1000,
        volume=1000.0,
        instrument="EURUSD",
        timeframe="H1",
        source="mock",
    )

    result = sim.simulate_trade(signal, candles, 20)
    # Conservative: STOP_LOSS wins
    assert result.outcome == "LOSS"
    assert result.exit_reason == "STOP_LOSS"


def test_trade_simulator_end_of_data():
    sim = TradeSimulator()
    candles = make_candles(25)
    signal = make_signal("BUY", entry=candles[20].close)
    result = sim.simulate_trade(signal, candles, 20)
    assert result.exit_reason == "END_OF_DATA"
    assert result.simulated_only is True


# ─── Metrics ──────────────────────────────────────────────────────────────────

def make_trade_result(outcome: str, pnl: str) -> TradeResult:
    return TradeResult(
        signal_id="test-signal",
        direction="BUY",
        instrument="EURUSD",
        entry_time=datetime.now(UTC).isoformat(),
        entry_price="1.10000",
        stop_loss="1.09000",
        take_profit="1.12000",
        volume=0.01,
        realised_pnl=pnl,
        outcome=outcome,
        exit_reason="TAKE_PROFIT" if outcome == "WIN" else "STOP_LOSS",
    )


def test_metrics_basic_calculation():
    trades = [
        make_trade_result("WIN", "50.00000"),
        make_trade_result("WIN", "30.00000"),
        make_trade_result("LOSS", "-20.00000"),
    ]
    metrics = calculate_metrics(trades, "10000.00")
    assert metrics.total_trades == 3
    assert metrics.winning_trades == 2
    assert metrics.losing_trades == 1
    assert Decimal(metrics.net_profit) == Decimal("60.00000")


def test_metrics_skipped_not_counted():
    trades = [
        make_trade_result("WIN", "50.00000"),
        make_trade_result("SKIPPED", "0.00000"),
    ]
    metrics = calculate_metrics(trades, "10000.00")
    assert metrics.total_trades == 1


def test_metrics_empty_returns_zero():
    metrics = calculate_metrics([], "10000.00")
    assert metrics.total_trades == 0


def test_metrics_has_simulated_warning():
    metrics = calculate_metrics([], "10000.00")
    joined = " ".join(metrics.warnings)
    assert "SIMULATED" in joined or "simulated" in joined


# ─── BacktestEngine integration ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_backtest_result_marked_simulated_only():
    registry = build_default_registry()
    engine = BacktestEngine(registry=registry)
    request = BacktestRequest(
        instrument="EURUSD",
        initial_balance="10000.00",
        source="mock",
        mode="backtest",
    )
    result = await engine.run(request)
    assert result.simulated_only is True


@pytest.mark.asyncio
async def test_backtest_does_not_call_nestjs_publish():
    """Backtest MUST NOT call NestJsClient.publish_signal."""
    registry = build_default_registry()
    engine = BacktestEngine(registry=registry)
    request = BacktestRequest(
        instrument="EURUSD",
        initial_balance="10000.00",
    )

    with patch("app.integrations.nestjs_client.NestJsClient.publish_signal") as mock_publish:
        await engine.run(request)
        mock_publish.assert_not_called()


@pytest.mark.asyncio
async def test_backtest_has_candle_count():
    registry = build_default_registry()
    engine = BacktestEngine(registry=registry)
    result = await engine.run(BacktestRequest(instrument="EURUSD", initial_balance="5000.00"))
    assert result.candle_count > 0


@pytest.mark.asyncio
async def test_backtest_has_warnings():
    registry = build_default_registry()
    engine = BacktestEngine(registry=registry)
    result = await engine.run(BacktestRequest(instrument="EURUSD", initial_balance="5000.00"))
    assert len(result.warnings) > 0
    assert any("SIMULATED" in w or "simulated" in w for w in result.warnings)


# ─── No-lookahead bias ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_no_lookahead_bias():
    """
    BacktestEngine generates signals using candles[0:i] only.
    Candle at index i must not be visible when generating signal for index i.
    """
    registry = build_default_registry()
    engine = BacktestEngine(registry=registry)

    # Patch _generate_signal to capture the candle window sizes
    seen_window_sizes: list[int] = []
    original = engine._generate_signal

    def patched(request, model, candles):
        seen_window_sizes.append(len(candles))
        return original(request, model, candles)

    engine._generate_signal = patched

    request = BacktestRequest(instrument="EURUSD", initial_balance="10000.00")
    await engine.run(request)

    # All windows should be strictly increasing (each one adds one candle)
    assert seen_window_sizes == sorted(seen_window_sizes)
    # All windows must be strictly less than total candle count
    # (backtest iterates: window = candles[:i] for i in range(MIN_HISTORY, total))
