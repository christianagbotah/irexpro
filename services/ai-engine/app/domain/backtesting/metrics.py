"""
Backtest metrics calculator.

WARNING: All metrics are historical simulation results only.
They do not guarantee, predict, or imply future trading performance.
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from app.domain.backtesting.schemas import BacktestMetrics, TradeResult


def _d(v: str | float | Decimal) -> Decimal:
    return Decimal(str(v))


def calculate_metrics(
    trades: list[TradeResult],
    initial_balance: str,
) -> BacktestMetrics:
    """
    Compute summary metrics from a list of simulated trade results.

    Only WIN/LOSS/BREAKEVEN outcomes are counted; SKIPPED trades are excluded
    from win-rate and profit calculations.
    """
    q = Decimal("0.00001")
    q2 = Decimal("0.01")

    executed = [t for t in trades if t.outcome != "SKIPPED"]
    if not executed:
        return BacktestMetrics(total_trades=0)

    wins = [t for t in executed if t.outcome == "WIN"]
    losses = [t for t in executed if t.outcome == "LOSS"]

    total = len(executed)
    n_wins = len(wins)
    n_losses = len(losses)
    win_rate = Decimal(n_wins) / Decimal(total) * 100 if total else Decimal("0")

    gross_profit = sum((_d(t.realised_pnl) for t in wins), Decimal("0"))
    gross_loss = sum((abs(_d(t.realised_pnl)) for t in losses), Decimal("0"))
    net_profit = gross_profit - gross_loss

    profit_factor = (
        (gross_profit / gross_loss).quantize(q2, ROUND_HALF_UP)
        if gross_loss > 0
        else Decimal("0")
    )

    avg_win = (gross_profit / n_wins).quantize(q, ROUND_HALF_UP) if n_wins else Decimal("0")
    avg_loss = (gross_loss / n_losses).quantize(q, ROUND_HALF_UP) if n_losses else Decimal("0")

    largest_win = max((_d(t.realised_pnl) for t in wins), default=Decimal("0"))
    largest_loss = max((abs(_d(t.realised_pnl)) for t in losses), default=Decimal("0"))

    # Balance curve + drawdown
    balance = _d(initial_balance)
    peak = balance
    max_dd = Decimal("0")
    curve: list[str] = [str(balance.quantize(q, ROUND_HALF_UP))]

    for trade in executed:
        balance += _d(trade.realised_pnl)
        curve.append(str(balance.quantize(q, ROUND_HALF_UP)))
        peak = max(peak, balance)
        drawdown = peak - balance
        max_dd = max(max_dd, drawdown)

    max_dd_pct = (max_dd / _d(initial_balance) * 100).quantize(q2, ROUND_HALF_UP) if _d(initial_balance) > 0 else Decimal("0")

    # Consecutive wins/losses
    max_consec_wins = _max_consecutive(executed, "WIN")
    max_consec_losses = _max_consecutive(executed, "LOSS")

    # Expectancy placeholder (average outcome per trade)
    expectancy = ((n_wins * float(avg_win) - n_losses * float(avg_loss)) / total) if total else 0.0

    return BacktestMetrics(
        total_trades=total,
        winning_trades=n_wins,
        losing_trades=n_losses,
        win_rate=str(win_rate.quantize(q2, ROUND_HALF_UP)),
        gross_profit=str(gross_profit.quantize(q, ROUND_HALF_UP)),
        gross_loss=str(gross_loss.quantize(q, ROUND_HALF_UP)),
        net_profit=str(net_profit.quantize(q, ROUND_HALF_UP)),
        profit_factor=str(profit_factor),
        average_win=str(avg_win),
        average_loss=str(avg_loss),
        largest_win=str(largest_win.quantize(q, ROUND_HALF_UP)),
        largest_loss=str(largest_loss.quantize(q, ROUND_HALF_UP)),
        max_drawdown=str(max_dd.quantize(q, ROUND_HALF_UP)),
        max_drawdown_percent=str(max_dd_pct),
        expectancy_placeholder=str(Decimal(str(expectancy)).quantize(q, ROUND_HALF_UP)),
        consecutive_wins=max_consec_wins,
        consecutive_losses=max_consec_losses,
        balance_curve=curve,
    )


def _max_consecutive(trades: list[TradeResult], outcome: str) -> int:
    max_run = current = 0
    for t in trades:
        if t.outcome == outcome:
            current += 1
            max_run = max(max_run, current)
        else:
            current = 0
    return max_run
