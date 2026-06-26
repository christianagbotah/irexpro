"""
BacktestEngine — runs an isolated backtest simulation.

IMPORTANT SAFETY RULES:
1. Never publishes signals to NestJS.
2. Never calls NestJsClient.publish_signal().
3. Never calls the broker or execution APIs.
4. Never schedules live signal generation jobs.
5. Operates on historical/mock candle data only.
6. No lookahead bias: each signal is generated using only candles[0:i] (exclusive).
"""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from app.core.logging import get_logger
from app.domain.backtesting.report_builder import build_report
from app.domain.backtesting.schemas import BacktestRequest, BacktestResult, TradeResult
from app.domain.backtesting.trade_simulator import TradeSimulator
from app.domain.backtesting.validation import MIN_CANDLE_COUNT, validate_candles
from app.domain.market_data.providers.mock_provider import MockMarketDataProvider
from app.domain.market_data.schemas import OHLCVCandle
from app.domain.models.feature_engineering import candles_to_dataframe, extract_latest_features
from app.domain.models.registry import ModelRegistry
from app.domain.signals.confidence import is_above_threshold
from app.domain.signals.schemas import AiSignalCandidate

logger = get_logger(__name__)

# Minimum history window before attempting signal generation (no lookahead)
MIN_HISTORY_WINDOW = 20
# Placeholder user IDs for backtest-only context
_BACKTEST_USER_ID = "backtest-user"
_BACKTEST_SESSION_ID = "backtest-session"
_BACKTEST_CONN_ID = "backtest-connection"


class BacktestEngine:
    """
    Runs a complete backtest simulation against a candle series.

    NEVER publishes signals externally. NEVER calls broker/execution APIs.
    """

    def __init__(self, registry: ModelRegistry) -> None:
        self._registry = registry

    async def run(self, request: BacktestRequest) -> BacktestResult:
        started_at = datetime.now(UTC)

        # 1. Resolve candles
        candles = await self._resolve_candles(request)
        validate_candles(candles)

        # 2. Set up simulator
        simulator = TradeSimulator(
            spread_pips=request.spread_pips,
            slippage_pips=request.slippage_pips,
        )

        # 3. Get model
        model = self._registry.get_active_model()
        governance = self._registry.get_governance(model.get_model_version())
        if not governance.approved_for_paper:
            # Fall back gracefully — backtest uses scaffold model
            logger.warning("Model not approved for paper; proceeding with scaffold")

        trades: list[TradeResult] = []

        # 4. Walk candles — no lookahead: signal uses candles[0:i] only
        for i in range(MIN_HISTORY_WINDOW, len(candles)):
            window = candles[:i]  # strictly historical — never includes candle i+1

            try:
                candidate = self._generate_signal(
                    request=request,
                    model=model,
                    candles=window,
                )
            except Exception as e:
                logger.debug("Signal generation skipped at candle %d: %s", i, str(e))
                continue

            if candidate is None:
                # Below confidence threshold — record skipped trade
                continue

            trade = simulator.simulate_trade(candidate, candles, i)
            trades.append(trade)

        # 5. Build result
        result = build_report(
            request=request,
            trades=trades,
            started_at=started_at,
        )
        result.candle_count = len(candles)

        logger.info(
            "Backtest completed",
            instrument=request.instrument,
            total_trades=len(trades),
            simulated_only=True,
        )
        return result

    def _generate_signal(
        self,
        request: BacktestRequest,
        model,
        candles: list[OHLCVCandle],
    ) -> AiSignalCandidate | None:
        """
        Generate a signal candidate using only historical candles.
        Returns None if confidence is below threshold.

        NO publish, NO NestJS call, NO broker call.
        """

        df = candles_to_dataframe(candles)
        features = extract_latest_features(df)
        prediction = model.predict_signal(features)

        if not is_above_threshold(prediction.confidence_score):
            return None

        last = candles[-1]
        atr = features.get("hl_range", last.close * 0.001) * 1.5
        if prediction.direction == "BUY":
            sl = round(last.close - atr * 1.5, 5)
            tp = round(last.close + atr * 2.0, 5)
        else:
            sl = round(last.close + atr * 1.5, 5)
            tp = round(last.close - atr * 2.0, 5)

        return AiSignalCandidate(
            signal_id=str(uuid4()),
            user_id=_BACKTEST_USER_ID,
            trading_session_id=_BACKTEST_SESSION_ID,
            broker_connection_id=_BACKTEST_CONN_ID,
            instrument=request.instrument.upper(),
            direction=prediction.direction,
            confidence_score=prediction.confidence_score,
            suggested_entry_price=last.close,
            suggested_stop_loss=sl,
            suggested_take_profit=tp,
            suggested_volume=0.01,
            timeframe=request.timeframe,
            strategy_code=request.strategy_code,
            model_version=prediction.model_version,
            market_regime=None,
            volatility_score=None,
        )

    async def _resolve_candles(self, request: BacktestRequest) -> list[OHLCVCandle]:
        """Load candles from request or generate mock data."""
        if request.candles:
            return [OHLCVCandle(**c) for c in request.candles]

        provider = MockMarketDataProvider()
        count = max(100, MIN_CANDLE_COUNT + 1)
        return await provider.get_ohlcv(
            request.instrument,
            request.timeframe,
            count,
        )
