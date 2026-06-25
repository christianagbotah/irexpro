# 16 — Observability and Monitoring

## iRexPro — Logging, Metrics, Tracing, and Alerting Architecture

---

## 1. Purpose

This document defines the observability architecture for iRexPro — how the platform monitors its own health, surfaces issues, generates alerts, and provides operational visibility into trading system behaviour.

---

## 2. Observability Pillars

iRexPro implements the three pillars of observability:

| Pillar | Technology | Purpose |
|---|---|---|
| **Logs** | Structured JSON + Winston / Pino | Event records, error details, audit trail |
| **Metrics** | Prometheus + Grafana | Numeric measurements over time |
| **Traces** | OpenTelemetry (future) | Request flow across services |

---

## 3. Structured Logging

### 3.1 Log Format

All application logs are emitted as structured JSON:

```json
{
  "timestamp": "2026-06-25T10:00:00.000Z",
  "level": "info",
  "service": "irexpro-api",
  "requestId": "req_a1b2c3",
  "userId": "usr_xyz",
  "event": "TRADE_OPENED",
  "data": {
    "tradeId": "trd_123",
    "instrument": "EURUSD",
    "direction": "BUY",
    "lotSize": "0.10",
    "entryPrice": "1.08420"
  },
  "duration_ms": 245
}
```

### 3.2 Log Levels

| Level | Usage |
|---|---|
| `error` | Unhandled exceptions, system failures, broker errors |
| `warn` | Risk rejections, retry attempts, degraded state |
| `info` | Normal business events: trade opened, subscription activated |
| `debug` | Detailed flow information (disabled in production) |

### 3.3 What Must Be Logged (Never Omit)

- Every trade open, modify, and close
- Every risk engine decision (approved and rejected)
- Every broker connection event (connected, disconnected, reconnected)
- Every kill switch state change
- Every authentication event (login, logout, failed login, MFA)
- Every subscription state change
- Every fee calculation and settlement
- Every admin action
- Every AI signal generated and its disposition

### 3.4 What Must Never Be Logged

- Decrypted broker credentials
- JWT signing keys or secrets
- User passwords or password hashes
- MFA TOTP secrets
- Payment card numbers or CVVs

### 3.5 Log Storage

| Environment | Storage |
|---|---|
| Development | Console output |
| Staging | CloudWatch Logs / Datadog (7-day retention) |
| Production | CloudWatch Logs + S3 archive (7-year retention for compliance) |

---

## 4. Metrics

### 4.1 Prometheus Metrics Exposed

**System Metrics (auto-collected)**
- CPU usage per service
- Memory usage per service
- HTTP request duration histogram
- HTTP request rate (per endpoint, per status code)
- Database connection pool usage
- Redis connection health
- Queue depth (BullMQ)

**Business Metrics (custom)**

```typescript
// Counters
trades_opened_total{instrument, direction}
trades_closed_total{instrument, direction, close_reason}
risk_rejections_total{rejection_code}
signals_generated_total{instrument, timeframe}
signals_approved_total
signals_rejected_total{rejection_reason}
subscriptions_activated_total{plan}
subscriptions_expired_total

// Gauges
active_trading_sessions_current
open_trades_current
broker_connections_active
kill_switch_status{0=inactive, 1=active}

// Histograms
signal_to_execution_duration_seconds
broker_order_response_duration_seconds
risk_evaluation_duration_seconds
```

### 4.2 Grafana Dashboards

| Dashboard | Contents |
|---|---|
| **System Health** | Service uptime, CPU/memory, error rates, latency |
| **Trading Activity** | Active sessions, open trades, trades per hour, signal volume |
| **Risk Engine** | Rejection rate, rejection breakdown by code, kill switch status |
| **Broker Health** | Connection status per broker, reconnection events, order latency |
| **AI Engine** | Signal generation rate, confidence distribution, model version |
| **Revenue** | Daily/weekly subscriptions, performance fees, settlement status |
| **User Activity** | Registrations, logins, subscription activations |

---

## 5. Health Check Endpoints

Each service exposes health check endpoints:

```
GET /health
→ 200 { status: "ok", uptime: 12345, timestamp: "..." }

GET /health/ready
→ 200 { status: "ready", checks: { database: "ok", redis: "ok", broker: "ok" } }
→ 503 { status: "not_ready", checks: { database: "ok", redis: "failing", broker: "ok" } }

GET /health/live
→ 200 { status: "alive" }
```

Kubernetes liveness and readiness probes use these endpoints. The load balancer removes unhealthy instances from rotation.

---

## 6. Alerting

### 6.1 Alert Channels

| Channel | Purpose |
|---|---|
| Slack `#alerts-critical` | P1 and P2 alerts |
| Slack `#alerts-info` | P3 alerts, deployment notifications |
| PagerDuty | P1 alerts requiring immediate human response |
| Email | P1 post-incident reports |

### 6.2 Alert Rules

**P1 — Immediate Response Required**

| Alert | Condition | Response |
|---|---|---|
| API service down | Health check fails for 2+ minutes | PagerDuty + Slack |
| Broker connection lost (all users) | All BrokerConnections DISCONNECTED for > 5 minutes | PagerDuty + Slack |
| Kill switch unexpectedly active | kill_switch_status = 1 without admin action in audit log | PagerDuty + Slack |
| Database connection failure | DB health check failing | PagerDuty + Slack |
| Error rate spike | 5xx error rate > 5% for 5 minutes | PagerDuty + Slack |
| Execution engine halted | No successful order placements in 30 minutes during active session | PagerDuty |

**P2 — High Priority**

| Alert | Condition |
|---|---|
| Signal engine not generating signals | No signals in 15 minutes during market hours |
| High risk rejection rate | > 20 risk rejections per minute across all users |
| Reconciliation failures | > 5 RECONCILIATION_PENDING trades older than 30 minutes |
| Settlement job failure | Fee settlement job has not run in 25 hours (daily cycle) |
| Broker reconnection repeated failures | > 3 reconnection attempts failed for same connection |

**P3 — Informational**

| Alert | Condition |
|---|---|
| High login failure rate | > 20 failed logins per minute |
| Queue depth growing | BullMQ queue depth > 100 items for 10+ minutes |
| Memory usage high | Service memory > 80% for 15 minutes |
| Slow query detected | Database query > 1000ms |

---

## 7. Trading-Specific Observability

### 7.1 Signal-to-Execution Trace

For every trade, the full signal-to-execution chain must be reconstructable from logs:

```
1. Signal generated → signalId, engineVersion, instrument, confidence
2. Strategy Orchestrator decision → signalId, approved/rejected, reason
3. Risk Engine decision → signalId, approved/rejected, rejection code
4. Execution Engine → signalId, tradeId, idempotencyKey
5. Broker submission → tradeId, externalOrderId, filledPrice, filledAt
6. Trade lifecycle events → modifications, closure, P&L
```

Querying by `signalId` reconstructs the complete chain. Querying by `tradeId` provides execution detail.

### 7.2 Anomaly Detection (Future)

- Detect when signal generation rate drops unexpectedly during market hours
- Detect when win rate drops significantly below historical baseline
- Detect when average trade duration shortens (possible SL-hunting regime)
- Alert when a single user account triggers high frequency of risk violations

---

## 8. Distributed Tracing (Phase 2)

OpenTelemetry SDK will be integrated to provide distributed traces across NestJS API, Python services, and database calls:

```
Trace: user activates AI trading
  Span: POST /trading/session/start
    → Span: SubscriptionService.checkActive()
    → Span: BrokerService.checkConnected()
    → Span: TradingSessionService.create()
    → Span: AuditService.log()
  Trace exported to: Jaeger / Grafana Tempo
```

Trace IDs will be included in all log entries, enabling log-trace correlation.

---

## 9. SLA / SLO Targets

| Service | SLO |
|---|---|
| API availability | 99.9% (< 8.7 hours downtime/year) |
| Signal engine availability | 99.5% during market hours |
| Broker connection health check success rate | 99.0% |
| Trade execution acknowledgement latency | p95 < 2 seconds |
| Risk Engine evaluation latency | p99 < 100ms |
| Dashboard real-time update latency | p95 < 1 second |

SLO burn rate alerts fire when error budget is being consumed faster than acceptable.
