"""
TradeSimulator — simulates trade execution against OHLCV candle data.

IMPORTANT:
- This simulator NEVER calls any broker or execution API.
- All results are simulated only.
- Conservative same-candle SL/TP assumption: if both SL and TP are hit within
  the same candle, stop-loss is assumed to trigger first (pessimistic/conservative).
  This is a documented assumption to avoid over-estimating paper returns.
"""
from __future__ import annotations

from datetime import UTC
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal
from uuid import uuid4

from app.core.logging import get_logger
from app.domain.backtesting.schemas import TradeResult
from app.domain.market_data.schemas import OHLCVCandle
from app.domain.signals.schemas import AiSignalCandidate

logger = get_logger(__name__)

PIP_SIZE = Decimal("0.00010")


def _d(value: float | str | Decimal) -> Decimal:
    return Decimal(str(value))


class TradeSimulator:
    """
    Simulates BUY/SELL trades against a sequence of OHLCV candles.

    Conservative same-candle SL/TP handling:
      When both SL and TP prices fall within a single candle's [low, high] range,
      the stop-loss is assumed to trigger first (unfavourable to the trader).
      This avoids over-estimating simulated performance.
    """

    def __init__(
        self,
        spread_pips: float = 1.0,
        slippage_pips: float = 0.5,
        pip_size: Decimal | None = None,
    ) -> None:
        self._spread = _d(spread_pips) * (pip_size or PIP_SIZE)
        self._slippage = _d(slippage_pips) * (pip_size or PIP_SIZE)

    def simulate_trade(
        self,
        signal: AiSignalCandidate,
        candles: list[OHLCVCandle],
        entry_candle_index: int,
    ) -> TradeResult:
        """
        Simulate a single trade from entry_candle_index forward.

        Returns a TradeResult. simulatedOnly is always True.
        """
        if entry_candle_index >= len(candles):
            return self._skipped(signal, "INVALID_SIGNAL")

        entry_candle = candles[entry_candle_index]

        # Apply spread/slippage to entry
        raw_entry = _d(signal.suggested_entry_price or entry_candle.close)
        if signal.direction == "BUY":
            entry_price = raw_entry + self._spread + self._slippage
        else:
            entry_price = raw_entry - self._spread - self._slippage

        sl = _d(signal.suggested_stop_loss)
        tp = _d(signal.suggested_take_profit)
        volume = _d(signal.suggested_volume)

        # Scan subsequent candles for SL/TP hit
        for idx in range(entry_candle_index + 1, len(candles)):
            candle = candles[idx]
            low = _d(candle.low)
            high = _d(candle.high)

            sl_hit, tp_hit = self._check_sl_tp(signal.direction, low, high, sl, tp)

            if sl_hit and tp_hit:
                # Conservative: stop-loss wins (pessimistic assumption, documented)
                return self._close_trade(
                    signal, entry_candle, candle, entry_price, sl,
                    volume, "LOSS", "STOP_LOSS"
                )

            if sl_hit:
                return self._close_trade(
                    signal, entry_candle, candle, entry_price, sl,
                    volume, "LOSS", "STOP_LOSS"
                )

            if tp_hit:
                return self._close_trade(
                    signal, entry_candle, candle, entry_price, tp,
                    volume, "WIN", "TAKE_PROFIT"
                )

        # Trade not closed — end of data
        last_candle = candles[-1]
        last_price = _d(last_candle.close)
        pnl = self._calc_pnl(signal.direction, entry_price, last_price, volume)
        outcome: Literal["WIN", "LOSS", "BREAKEVEN"] = (
            "WIN" if pnl > 0 else "LOSS" if pnl < 0 else "BREAKEVEN"
        )

        return TradeResult(
            trade_id=str(uuid4()),
            signal_id=signal.signal_id,
            direction=signal.direction,
            instrument=signal.instrument,
            entry_time=entry_candle.timestamp.astimezone(UTC).isoformat(),
            exit_time=last_candle.timestamp.astimezone(UTC).isoformat(),
            entry_price=str(entry_price.quantize(Decimal("0.00001"), ROUND_HALF_UP)),
            exit_price=str(last_price.quantize(Decimal("0.00001"), ROUND_HALF_UP)),
            stop_loss=str(sl),
            take_profit=str(tp),
            volume=float(volume),
            realised_pnl=str(pnl.quantize(Decimal("0.00001"), ROUND_HALF_UP)),
            outcome=outcome,
            exit_reason="END_OF_DATA",
            simulated_only=True,
        )

    # ─── Helpers ──────────────────────────────────────────────────────────────

    def _check_sl_tp(
        self,
        direction: str,
        low: Decimal,
        high: Decimal,
        sl: Decimal,
        tp: Decimal,
    ) -> tuple[bool, bool]:
        if direction == "BUY":
            sl_hit = low <= sl
            tp_hit = high >= tp
        else:
            sl_hit = high >= sl
            tp_hit = low <= tp
        return sl_hit, tp_hit

    def _calc_pnl(
        self,
        direction: str,
        entry: Decimal,
        exit_price: Decimal,
        volume: Decimal,
    ) -> Decimal:
        if direction == "BUY":
            return (exit_price - entry) * volume * Decimal("100000")
        return (entry - exit_price) * volume * Decimal("100000")

    def _close_trade(
        self,
        signal: AiSignalCandidate,
        entry_candle: OHLCVCandle,
        exit_candle: OHLCVCandle,
        entry_price: Decimal,
        exit_price: Decimal,
        volume: Decimal,
        outcome: Literal["WIN", "LOSS", "BREAKEVEN"],
        exit_reason: Literal["TAKE_PROFIT", "STOP_LOSS"],
    ) -> TradeResult:
        pnl = self._calc_pnl(signal.direction, entry_price, exit_price, volume)
        return TradeResult(
            trade_id=str(uuid4()),
            signal_id=signal.signal_id,
            direction=signal.direction,
            instrument=signal.instrument,
            entry_time=entry_candle.timestamp.astimezone(UTC).isoformat(),
            exit_time=exit_candle.timestamp.astimezone(UTC).isoformat(),
            entry_price=str(entry_price.quantize(Decimal("0.00001"), ROUND_HALF_UP)),
            exit_price=str(exit_price.quantize(Decimal("0.00001"), ROUND_HALF_UP)),
            stop_loss=str(signal.suggested_stop_loss),
            take_profit=str(signal.suggested_take_profit),
            volume=float(volume),
            realised_pnl=str(pnl.quantize(Decimal("0.00001"), ROUND_HALF_UP)),
            outcome=outcome,
            exit_reason=exit_reason,
            simulated_only=True,
        )

    def _skipped(
        self,
        signal: AiSignalCandidate,
        reason: Literal["INVALID_SIGNAL", "CONFIDENCE_TOO_LOW"],
    ) -> TradeResult:
        entry_price = signal.suggested_entry_price or 0.0
        return TradeResult(
            trade_id=str(uuid4()),
            signal_id=signal.signal_id,
            direction=signal.direction,
            instrument=signal.instrument,
            entry_time=signal.generated_at.isoformat(),
            entry_price=str(entry_price),
            stop_loss=str(signal.suggested_stop_loss),
            take_profit=str(signal.suggested_take_profit),
            volume=signal.suggested_volume,
            outcome="SKIPPED",
            exit_reason=reason,
            simulated_only=True,
        )
