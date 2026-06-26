# iRexPro — Technology Stack

---

## Stack Selection Principles

1. **Production-grade first** — no prototype technologies; every selection must support production workloads
2. **TypeScript everywhere** — type safety across frontend and backend reduces bugs in financial logic
3. **Python for AI/ML** — Python is the de-facto standard for ML; use it where it excels
4. **Separation of concerns** — each layer uses the right tool for its job
5. **Open standards** — avoid vendor lock-in; prefer open standards and cloud-agnostic approaches
6. **Observability-native** — every component must support structured logging, metrics, and health checks

---

## Frontend — Web Application

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 14+ | React framework with App Router, SSR/SSG, API routes |
| **TypeScript** | 5+ | Static typing for all frontend code |
| **Tailwind CSS** | 3+ | Utility-first CSS framework |
| **shadcn/ui** | Latest | Accessible, headless UI component library |
| **Zustand** | Latest | Lightweight client state management |
| **TanStack Query** | v5 | Server state management, caching, background sync |
| **Socket.IO client** | 4+ | WebSocket client for real-time updates |
| **React Hook Form** | Latest | Form management with validation |
| **Zod** | Latest | Runtime type validation (shared with backend) |
| **Recharts** | Latest | Chart library for equity curve and P&L charts |
| **date-fns** | Latest | Date manipulation (no Moment.js) |

---

## Frontend — Mobile Application

| Technology | Version | Purpose |
|---|---|---|
| **React Native** | 0.73+ | Cross-platform mobile framework |
| **TypeScript** | 5+ | Static typing |
| **Expo** | Latest SDK | Managed workflow for faster development |
| **React Navigation** | v6 | Navigation and routing |
| **TanStack Query** | v5 | Server state management |
| **Socket.IO client** | 4+ | Real-time updates |
| **React Native Paper** | Latest | Material Design UI components |
| **React Native Reanimated** | Latest | Performant animations |
| **Zod** | Latest | Schema validation (shared with web) |

---

## Backend — API

| Technology | Version | Purpose |
|---|---|---|
| **NestJS** | 10+ | TypeScript Node.js framework (modular monolith) |
| **TypeScript** | 5+ | Static typing |
| **TypeORM** | Latest | ORM with migration support |
| **class-validator** | Latest | DTO validation decorators |
| **class-transformer** | Latest | Serialisation and DTO transformation |
| **@nestjs/swagger** | Latest | OpenAPI documentation auto-generation |
| **@nestjs/jwt** | Latest | JWT token management |
| **@nestjs/throttler** | Latest | Rate limiting |
| **@nestjs/websockets** | Latest | WebSocket gateway (Socket.IO) |
| **BullMQ** | Latest | Redis-backed job queue |
| **ioredis** | Latest | Redis client |
| **bcrypt** | Latest | Password hashing |
| **Winston** | Latest | Structured logging |
| **Helmet** | Latest | HTTP security headers |
| **Decimal.js** | Latest | Decimal-safe arithmetic for all financial calculations |
| **uuid** | Latest | UUID v4 generation |
| **Zod** | Latest | Schema validation (shared with frontend) |

---

## AI/ML Services — Python (`services/ai-engine/`)

> Sprint 7 baseline scaffold. Paper mode only. No live trading approval.

| Technology | Version | Purpose |
|---|---|---|
| **Python** | 3.11+ | Runtime |
| **FastAPI** | 0.115+ | HTTP API framework |
| **Uvicorn** | 0.32+ | ASGI server |
| **pydantic** | v2.9+ | Data validation and schemas |
| **pydantic-settings** | 2.6+ | Environment variable config |
| **pandas** | 2.2+ | Data manipulation and feature engineering |
| **numpy** | 2.1+ | Numerical computation |
| **scikit-learn** | 1.5+ | ML preprocessing |
| **XGBoost** | 2.1+ | Gradient boosting classifier (baseline scaffold) |
| **redis (redis-py async)** | 5.2+ | OHLCV Redis cache (separate DB from API) |
| **httpx** | 0.27+ | Async HTTP client for NestJS integration |
| **structlog** | 24.4+ | Structured JSON logging |
| **python-dotenv** | 1.0+ | .env file loading |
| **pytest** | 8.3+ | Testing |
| **pytest-asyncio** | 0.24+ | Async test support |
| **ruff** | 0.7+ | Fast linter and formatter |
| **mypy** | 1.13+ | Static type checking |
| **coverage** | 7.6+ | Test coverage |
| **APScheduler** | Latest | Scheduled signal generation jobs (Sprint 8+) |
| **MLflow** | Latest | Model versioning and experiment tracking (Sprint 9+) |
| **LightGBM / PyTorch** | Latest | Alternative models (future sprints) |

**Service endpoints:**
- `GET /api/v1/health` — health check
- `GET /api/v1/models/active` — active model metadata
- `POST /api/v1/market-data/mock-ohlcv` — mock OHLCV (dev only)
- `POST /api/v1/signals/generate` — generate candidate (not published)
- `POST /api/v1/signals/publish-to-api` — generate + forward to NestJS

**NestJS integration:**
- `POST /api/v1/ai/internal/signals` — protected by `InternalApiKeyGuard` (`x-irexpro-internal-api-key`)
- All signals route through `AiSignalService → StrategyOrchestrator → RiskEngine → Execution`

---

## Database

| Technology | Version | Purpose |
|---|---|---|
| **PostgreSQL** | 15+ | Primary relational database |
| **Redis** | 7+ | Cache, session store, pub/sub, job queue |
| **TimescaleDB** (future) | Latest | Time-series extension for market data |

---

## Infrastructure and DevOps

| Technology | Version | Purpose |
|---|---|---|
| **Docker** | Latest | Containerisation |
| **Docker Compose** | v2 | Local development orchestration |
| **Kubernetes** | 1.28+ | Production orchestration (Phase 2) |
| **Nginx** | Latest | Reverse proxy, TLS termination |
| **GitHub Actions** | — | CI/CD pipelines |
| **AWS ECS Fargate** | — | Initial production container hosting |
| **AWS RDS (PostgreSQL)** | — | Managed production database |
| **AWS ElastiCache (Redis)** | — | Managed production cache |
| **AWS KMS** | — | Key encryption key management |
| **AWS Secrets Manager** | — | Secret storage |
| **AWS S3** | — | File storage, backup |
| **AWS CloudFront** | — | CDN for web app |
| **AWS Route 53** | — | DNS management |

---

## Observability

| Technology | Version | Purpose |
|---|---|---|
| **Prometheus** | Latest | Metrics collection |
| **Grafana** | Latest | Metrics dashboards |
| **Sentry** | Latest | Error tracking and alerting |
| **CloudWatch Logs** | — | Log aggregation (AWS) |
| **OpenTelemetry** | Latest | Distributed tracing (Phase 2) |
| **Jaeger / Grafana Tempo** | Latest | Trace storage and visualisation (Phase 2) |

---

## Payment Providers (IPaymentProvider Adapters)

| Provider | ID | Region | Phase |
|---|---|---|---|
| **Stripe** | `stripe` | Global | Phase 2 live |
| **PayPal / Braintree** | `paypal` | Global | Phase 2 live |
| **Paystack** | `paystack` | Africa (NG, GH, KE, ZA) | Phase 2 live |
| **Flutterwave** | `flutterwave` | Pan-Africa (30+ countries) | Phase 2 live |
| **Hubtel** | `hubtel` | Ghana | Phase 2 live |
| **Wise** | `wise` | Global (payouts) | Phase 3 |
| **Manual (Admin)** | `manual` | All | Phase 1 (pilot) |

---

## SMS Providers (ISmsProvider Adapters)

| Provider | ID | Region | Phase |
|---|---|---|---|
| **Twilio** | `twilio` | Global | Phase 1 |
| **Hubtel SMS** | `hubtel` | Ghana | Phase 1 |
| **Arkesel** | `arkesel` | Africa (GH, NG, KE, ZA) | Phase 1 |
| **AWS SNS** | `aws_sns` | Global | Phase 1 (fallback) |
| **Africa's Talking** | `africastalking` | Africa (18 countries) | Phase 3 |

---

## Security

| Technology | Purpose |
|---|---|
| **AWS KMS** | Key Encryption Key for broker credential envelope encryption |
| **HashiCorp Vault** (alternative) | Secret management and dynamic secrets |
| **TruffleHog** | Secret scanning in Git history and CI |
| **Semgrep** | Static application security testing (SAST) |
| **OWASP ZAP** | Dynamic application security testing (DAST) |
| **npm audit / pip audit** | Dependency vulnerability scanning |

---

## Testing

| Technology | Purpose |
|---|---|
| **Jest** + ts-jest | NestJS unit and integration tests |
| **Supertest** | NestJS E2E HTTP testing |
| **pytest** | Python service tests |
| **pytest-asyncio** | Python async tests |
| **pytest-cov** | Python coverage reporting |
| **Playwright** (future) | Web E2E testing |
| **Detox** (future) | React Native E2E testing |
| **k6** | Load and performance testing |
| **Artillery** | WebSocket load testing |

---

## Development Tools

| Tool | Purpose |
|---|---|
| **ESLint** | TypeScript linting |
| **Prettier** | Code formatting |
| **Ruff** | Python linting (fast) |
| **Black** | Python formatting |
| **Husky** | Git hooks for pre-commit checks |
| **lint-staged** | Run linters on staged files only |
| **Conventional Commits** | Commit message standards |
| **commitlint** | Enforce conventional commit format |

---

## Internationalisation and Regionalisation

| Technology | Purpose |
|---|---|
| **next-intl** | Next.js i18n routing and translations (web app) |
| **react-i18next** | React Native translations (mobile app) |
| **Intl API** (browser/Node built-in) | Number, date, currency formatting per locale |
| **date-fns-tz** | Timezone-aware date manipulation |
| **Open Exchange Rates / Frankfurter** | FX rate API for display currency conversion |

---

## Decimal Arithmetic Policy

**All financial calculations must use `Decimal.js` (TypeScript) or Python's `decimal.Decimal` module.**

JavaScript's native `Number` type uses IEEE 754 floating-point, which produces rounding errors in financial calculations:

```javascript
// WRONG — never do this:
0.1 + 0.2 === 0.3 // false!

// CORRECT — always do this:
import Decimal from 'decimal.js';
new Decimal('0.1').plus('0.2').equals('0.3') // true
```

All monetary fields in API requests and responses use **string representation** to preserve precision across language boundaries.

All database monetary columns use `DECIMAL(18,8)` — never `FLOAT` or `DOUBLE`.
