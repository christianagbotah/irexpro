# iRexPro AI Signal Engine

> **Sprint 7 baseline scaffold. Paper mode only.**

The AI Signal Engine produces `AiSignalCandidate` objects from market data and
model inference. **It never executes trades directly.** All candidates are
forwarded to the NestJS `AiSignalService` which routes them through the full
safety pipeline:

```
AI Engine  →  NestJS AiSignalService
         →  StrategyOrchestrator
         →  Subscription Gate
         →  Broker Connection Gate
         →  Risk Engine
         →  Execution Engine
         →  Broker Adapter
```

---

## Quick Start

### Prerequisites
- Python 3.11+
- Redis running (optional — cache gracefully disabled if unavailable)
- NestJS API running on port 3000

### Setup

```powershell
# Windows PowerShell
cd services/ai-engine

python -m venv .venv
.venv\Scripts\Activate.ps1

pip install -e ".[dev]"

# Copy environment config
Copy-Item .env.example .env
# Edit .env as needed
```

### Run

```powershell
uvicorn app.main:app --reload --port 8001
```

Health check: http://localhost:8001/api/v1/health  
API docs:     http://localhost:8001/docs

---

## Running Tests

```powershell
pytest
```

With coverage:

```powershell
coverage run -m pytest
coverage report
```

---

## Linting and Type Checking

```powershell
ruff check .
mypy app
```

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Service health |
| GET | `/api/v1/models/active` | Active model metadata |
| GET | `/api/v1/models` | All registered models |
| POST | `/api/v1/market-data/mock-ohlcv` | Mock OHLCV data (dev only) |
| POST | `/api/v1/signals/generate` | Generate signal candidate (not published) |
| POST | `/api/v1/signals/publish-to-api` | Generate + publish to NestJS |

---

## Safety Rules

1. `AI_SIGNAL_MODE` defaults to `paper`. Live mode is not supported in Sprint 7.
2. No model is approved for live trading by default.
3. Signal candidates are never executed by this service.
4. Secrets are never logged or included in signal payloads.
5. The baseline XGBoost model is a scaffold — it does not contain real trained weights.

---

## Model Governance

See `app/domain/models/governance.py`. Live trading approval requires a future
formal governance workflow involving the quant team and legal/compliance review.
No automatic live approval path exists.
