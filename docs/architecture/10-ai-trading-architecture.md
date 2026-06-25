# 10 — AI Trading Architecture

## iRexPro — AI Signal Engine and Strategy Orchestration Design

---

## 1. Purpose

This document defines the AI trading architecture for iRexPro, covering the AI Signal Engine, Strategy Orchestrator, market data processing, model management, backtesting, and the governance model that ensures AI decisions are transparent, auditable, and controlled.

---

## 2. Core Principle

The AI trading layer generates recommendations. It does not execute trades. Every AI output must flow through the Strategy Orchestrator and Risk Engine before any broker action is taken. This is a non-negotiable architectural invariant.

```
Market Data Feed
  → Market Data Service
  → AI Signal Engine (technical analysis + ML inference)
  → Strategy Orchestrator (governance, filtering, confidence threshold)
  → Risk Engine (pre-execution validation)   ← Mandatory gate
  → Execution Engine
  → Broker Adapter
  → Broker
```

---

## 3. Technology Stack

| Component | Technology |
|---|---|
| Signal Engine | Python 3.11+, FastAPI |
| Strategy Orchestrator | Python 3.11+, FastAPI |
| Market Data Service | Python 3.11+, FastAPI |
| Backtesting Service | Python 3.11+, FastAPI |
| Model Registry | Python 3.11+, FastAPI |
| ML Framework | scikit-learn, XGBoost, LightGBM, PyTorch (future deep learning) |
| Technical Indicators | pandas-ta, TA-Lib |
| Data Storage | PostgreSQL + Redis (signal cache) |
| Model Storage | MLflow or local artifact store (S3-compatible) |
| Scheduling | APScheduler or Celery |

---

## 4. Market Data Service

### 4.1 Responsibilities
- Subscribe to price feeds from the Broker Adapter
- Normalise OHLCV data across different broker formats
- Store normalised data for indicator computation
- Serve cached market data to the Signal Engine
- Detect and handle data gaps or stale data

### 4.2 Data Flow

```
Broker price feed (WebSocket / REST polling)
  → Raw OHLCV normalisation
  → Redis cache (rolling window per instrument/timeframe)
  → PostgreSQL time-series table (persistent history)
  → Available to Signal Engine via REST API
```

### 4.3 Supported Timeframes

M1, M5, M15, M30, H1, H4, D1

### 4.4 Data Quality Checks

Before passing data to the Signal Engine:
- Check for missing candles (gap detection)
- Validate price range (reject obvious data errors: negative prices, zero volume on liquid pairs)
- Flag stale data (last candle timestamp beyond expected refresh interval)
- If data quality fails: do not generate signal; log quality failure; emit `MarketDataQualityFailed` event

---

## 5. AI Signal Engine

### 5.1 Responsibilities
- Ingest normalised OHLCV data
- Compute technical indicators
- Detect market regime
- Run ML model inference
- Generate structured signal output
- Assign confidence score

### 5.2 Signal Generation Pipeline

```
Step 1: Feature Engineering
  - Compute indicators on each active timeframe:
    Moving Averages: SMA(20), SMA(50), EMA(12), EMA(26)
    Momentum: RSI(14), MACD(12,26,9), Stochastic(14,3,3)
    Volatility: ATR(14), Bollinger Bands(20,2), Average Daily Range
    Volume: Volume MA, On-Balance Volume (if volume data available)
    Trend: ADX(14), Ichimoku Cloud, Parabolic SAR

Step 2: Market Regime Detection
  - Classify current market regime:
    TRENDING_UP: Strong uptrend confirmed
    TRENDING_DOWN: Strong downtrend confirmed
    RANGING: Low ADX, price between defined range
    HIGH_VOLATILITY: ATR significantly above average
    LOW_LIQUIDITY: Volume below threshold (avoid trading)
    PRE_NEWS: Within configurable window of high-impact news (future)

Step 3: ML Model Inference
  - Feature vector: indicator values + regime label + time features (hour, day of week, session)
  - Model: classification model → outputs probabilities for BUY / SELL / HOLD
  - Model also outputs: entry zone, SL distance (ATR-based), TP distance (ATR-based)

Step 4: Signal Construction
  {
    id: uuid,
    engineVersion: "v1.2.3",
    instrument: "EURUSD",
    timeframe: "H1",
    direction: "BUY",
    confidence: 0.78,
    entryPrice: 1.08420,
    suggestedSL: 1.08180,   // 24 pips below entry
    suggestedTP: 1.08900,   // 48 pips above entry (2:1 R:R)
    volatilityScore: 0.42,
    trendScore: 0.71,
    regimeDetected: "TRENDING_UP",
    indicators: { rsi: 56.2, macd: 0.00035, adx: 32.1, ... },
    generatedAt: "2026-06-25T10:00:00Z",
    expiresAt: "2026-06-25T11:00:00Z"
  }
```

### 5.3 Confidence Score

The confidence score (0.0 to 1.0) represents the model's estimated probability that the signal will result in a profitable trade, combining:
- ML model classification probability
- Regime alignment score (signal direction aligns with detected regime)
- Multi-timeframe confirmation score (higher timeframes confirm lower timeframe signal)
- Historical accuracy for this pattern type (from model training data)

Signals below the minimum confidence threshold (configurable, default: 0.65) are discarded by the Strategy Orchestrator.

### 5.4 Signal Validity Window

Each signal has an `expiresAt` timestamp. The Strategy Orchestrator must not process expired signals. Typical validity windows:
- M15 signal: expires after 15 minutes
- H1 signal: expires after 1 hour
- H4 signal: expires after 4 hours

---

## 6. Strategy Orchestrator

### 6.1 Responsibilities
- Receive signals from the Signal Engine
- Apply strategy governance rules
- Filter based on confidence threshold
- Prevent duplicate/conflicting signals
- Apply trading session constraints (time of day, max trades)
- Route approved signals to the Risk Engine
- Log all signal decisions (approved or rejected)

### 6.2 Governance Rules

```
Rule 1: Confidence Gate
  Reject signal if confidence < MIN_CONFIDENCE_THRESHOLD (default 0.65)

Rule 2: Strategy Version Gate
  Signal must be generated by the currently deployed active strategy version
  Old version signals are rejected immediately

Rule 3: Cooldown Window
  Reject BUY signal for EURUSD if a BUY EURUSD trade was opened within cooldown (default 60 min)
  Reject opposite-direction signal if an open trade exists in same instrument (no hedging by default)

Rule 4: Signal Expiry
  Reject signals past expiresAt timestamp

Rule 5: Trading Hours Gate (if configured)
  Reject signals outside configured trading hours for this strategy

Rule 6: Regime Filter (per strategy config)
  Some strategies may be configured to only trade TRENDING regimes
  Signals during LOW_LIQUIDITY regime are always rejected

Rule 7: Session Active Check
  Signal must correspond to an active TradingSession for a user
  If user's session is PAUSED or STOPPED: discard
```

### 6.3 Signal Routing

After governance validation, the approved signal is emitted as a `SignalApproved` event to the Risk Engine. The signal object is passed unchanged — the Risk Engine adds no AI interpretation, only risk validation.

---

## 7. Model Management

### 7.1 Model Versioning

Every trained model has a version record in the Model Registry:

```
ModelVersion {
  id: uuid
  version: "v1.2.3"
  algorithm: "XGBoostClassifier"
  trainedOn: "2026-05-01"
  validationMetrics: {
    accuracy: 0.61,
    precision: 0.63,
    recall: 0.58,
    f1: 0.60,
    sharpe: 1.42,
    maxDrawdownBacktest: 12.4%
  }
  instruments: ["EURUSD", "GBPUSD"]
  timeframes: ["H1", "H4"]
  status: "ACTIVE" | "STAGING" | "RETIRED" | "ROLLBACK_CANDIDATE"
  deployedAt: timestamp
  retiredAt: timestamp
}
```

### 7.2 Deployment Process

New model deployment follows a strict governance process:

```
Step 1: Model training completed
Step 2: Backtesting validation (minimum backtest period: 12 months)
Step 3: Walk-forward testing (out-of-sample validation)
Step 4: Paper trading deployment (minimum: 2 weeks)
Step 5: Performance review against acceptance criteria:
  - Sharpe ratio > 1.0
  - Max drawdown < 20%
  - Win rate > 45%
  - Profit factor > 1.3
Step 6: SuperAdmin approval in admin dashboard
Step 7: Staged rollout (e.g., 10% of users first)
Step 8: Full deployment
```

### 7.3 Model Rollback

If a deployed model shows degraded performance or unexpected behaviour:

```
SuperAdmin triggers rollback via admin dashboard
→ ModelRegistry sets current version status: ROLLED_BACK
→ Previous version promoted to ACTIVE
→ All active signals from rolled-back version are purged
→ AuditLog records rollback with reason
→ All affected trading sessions continue with previous model
```

---

## 8. Backtesting Service

### 8.1 Purpose
Validate strategies and models against historical data before any live deployment.

### 8.2 Capabilities
- Historical OHLCV data ingestion (from broker or third-party data provider)
- Simulation of signal generation against historical data
- Simulated order execution (slippage model configurable)
- Performance metrics computation
- Walk-forward testing (rolling window out-of-sample validation)
- Report generation (equity curve, drawdown chart, trade log)

### 8.3 Backtest Report Outputs

```
BacktestReport {
  strategyVersion: string
  instrument: string
  timeframe: string
  period: { from, to }
  totalTrades: integer
  winningTrades: integer
  losingTrades: integer
  winRate: decimal
  profitFactor: decimal
  totalPnl: decimal
  maxDrawdown: decimal
  sharpeRatio: decimal
  sortinoRatio: decimal
  averageWin: decimal
  averageLoss: decimal
  largestWin: decimal
  largestLoss: decimal
  equityCurve: OHLCV-style time series
}
```

---

## 9. Paper Trading Mode

Paper trading executes all real AI signal generation, strategy orchestration, and risk validation steps, but the Execution Engine uses a simulated broker adapter instead of a real one.

```
PaperBrokerAdapter implements IBrokerAdapter {
  // Uses real market price data
  // Simulates fills at current market price + configurable slippage
  // Does not connect to any real broker
  // Records paper trades in a separate paper_trades table
}
```

Paper trading is mandatory before any new:
- AI model version deployment
- Strategy configuration change
- New broker adapter deployment

---

## 10. Sentiment and News Integration (Future)

The AI Signal Engine includes hooks for future integration with news and sentiment data:

```
SentimentSignalProvider interface {
  getCurrentSentiment(instrument: string): Promise<SentimentScore>
}

SentimentScore {
  instrument: string
  score: number        // -1.0 (bearish) to +1.0 (bullish)
  source: string
  confidence: number
  capturedAt: Date
}
```

When integrated, sentiment score will be included in the feature vector alongside technical indicators. High-impact news events will trigger a `PRE_NEWS` regime that pauses signal generation for a configurable window.

---

## 11. Signal Audit Log

Every signal generated is recorded with full provenance:

```
SignalAuditEntry {
  signalId: uuid
  engineVersion: string
  disposition: "APPROVED" | "REJECTED"
  rejectionReason?: string
  riskDecision?: "APPROVED" | "REJECTED"
  riskRejectionReason?: string
  tradeId?: uuid    // if a trade was opened
  processedAt: timestamp
}
```

This audit chain allows complete reconstruction of why any trade was or was not opened at any point in time.

---

## 12. Sprint 6 — NestJS Signal Intake Foundation (Implemented)

The following components were implemented in Sprint 6 as the NestJS signal intake layer:

### AiSignalCandidate Interface

Defined in `apps/api/src/modules/strategy/interfaces/strategy.interface.ts`. Fields:
`signalId`, `userId`, `tradingSessionId`, `brokerConnectionId`, `instrument`, `direction`,
`confidenceScore` (0–1), `suggestedStopLoss`, `suggestedTakeProfit`, `suggestedVolume`,
`timeframe`, `strategyCode`, `marketRegime`, `volatilityScore`, `generatedAt`, `modelVersion`, `metadata`.

### AiSignalService (`apps/api/src/modules/ai/ai-signal.service.ts`)

- `receiveSignal(candidate)` — validates structure, audit-logs, publishes `AI_SIGNAL_RECEIVED` event, forwards to orchestrator
- `validateCandidate(candidate)` — structural validation (not execution)
- `forwardToStrategyOrchestrator(candidate)` — the ONLY forwarding path; never calls ExecutionService directly
- `buildSimulatedCandidate(userId, dto)` — used by dev simulate endpoint

### StrategyOrchestratorService (`apps/api/src/modules/strategy/strategy-orchestrator.service.ts`)

Full gate chain (fail at any gate = no execution):
1. Signal structure validation
2. Confidence threshold (≥ 0.6 required)
3. Trading session active
4. Subscription allows AI auto trading
5. Broker connection active
6. Risk Engine (`RiskService.validateProposedTrade()`) — MANDATORY
7. Execution Engine (`ExecutionService.executeTrade()`) — only on APPROVED

### Dev Simulate Endpoint

```
POST /api/v1/ai/dev/simulate-signal
```
- **DISABLED in production** (`NODE_ENV === 'production'` → 403)
- Requires JWT authentication
- Routes through full pipeline (no shortcuts)
- Audit-logged with `source: 'dev-simulate'`
