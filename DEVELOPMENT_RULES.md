# iRexPro — Development Rules

> These rules are non-negotiable. Every engineer contributing to iRexPro must read, understand, and follow them. They exist to protect users, protect the business, and produce a platform worthy of handling real financial activity.

---

## Rule 1 — AI Signals Never Execute Trades Directly

**The AI Signal Engine may only output signal recommendations. It must never call the Execution Engine or Broker Adapter directly.**

Every signal must travel through:
```
AI Signal Engine → Strategy Orchestrator → Risk Engine → Execution Engine → Broker Adapter
```

There is no bypass. Any code that routes around this pipeline is a critical defect.

**Why:** The AI can produce incorrect signals. The Risk Engine's job is to prevent those signals from causing financial harm. Bypassing the Risk Engine removes the safety layer that protects users.

---

## Rule 2 — Every Trade Decision Must Pass Through the Risk Engine

**The Risk Engine is the mandatory gateway for all trade actions: open, modify, and close.**

The Risk Engine must:
- Be called before every order submission to the broker
- Fail closed — system errors result in `REJECTED`, not `APPROVED`
- Be the only entity that emits `RiskApproved` events
- Have 100% branch coverage in unit tests

**No production code may contain a bypass path around the Risk Engine.**

---

## Rule 3 — Never Promise Guaranteed Profit

**No system-generated text, notification, email, or UI copy may promise, imply, or suggest guaranteed trading profits.**

Prohibited phrases (not exhaustive):
- "Guaranteed returns"
- "Never lose money"
- "Earn X% per month guaranteed"
- "Risk-free profits"
- "Beat the market"

Required disclaimers on all performance-related displays:
> "Past performance does not guarantee future results. Forex trading involves risk of loss."

Marketing copy must be reviewed against this rule before publication.

---

## Rule 4 — Paper Trading and Sandbox Testing Before Live Trading

**No AI model, strategy version, or new broker adapter may be deployed to live trading without prior validation in paper trading and broker sandbox mode.**

Required before live deployment:
1. Backtest on ≥ 12 months of historical data (meets acceptance criteria)
2. Walk-forward test validation
3. Minimum 2 weeks of paper trading on broker sandbox
4. Minimum 20 completed paper trades
5. SuperAdmin approval in model promotion workflow

**The `PaperBrokerAdapter` must be used for all pre-live validation. Never use live broker credentials in staging or CI.**

---

## Rule 5 — User Funds Remain With the Broker in Model A

**iRexPro Phase 1 does not hold, custody, or transfer user funds.**

No code, API, or database entry in Phase 1 should:
- Record an iRexPro-held user balance as if iRexPro is holding funds
- Accept or process user deposits into iRexPro-controlled accounts
- Transfer funds between user accounts internally

The internal wallet system exists in the data model as a future-ready placeholder. Do not activate Model B features in Phase 1.

---

## Rule 6 — Subscription Must Be Active Before AI Auto Trading Can Start

**The `TradingSessionModule` must check subscription status at every AI trading activation request.**

The check must be server-side. Client-provided subscription status must never be trusted.

```typescript
// Required gate in TradingSessionService.startSession()
const isActive = await this.subscriptionService.isActiveForTrading(userId);
if (!isActive) {
  throw new ForbiddenException('SUBSCRIPTION_INACTIVE');
}
```

This check must also be re-validated when:
- A `SubscriptionExpired` event is received (suspend active sessions)
- The subscription module receives a payment failure webhook

---

## Rule 7 — Profit Sharing Calculated Only From Realised Profits

**The Revenue Engine must only include closed trade P&L in performance fee calculations.**

- Open (floating) P&L: **excluded**
- Deposit amounts: **excluded**
- Realised closed trade P&L: **included** (positive and negative)

The `PerformanceAccount.totalRealisedPnl` field must only be updated when a trade is closed (status = CLOSED with a final `realisedPnl` value).

**Test requirement:** Every code path in fee calculation must be covered by unit tests that verify this rule.

---

## Rule 8 — High-Water Mark Must Prevent Repeated Charging on the Same Profit

**Performance fees are charged only on profit above the user's historical high-water mark.**

The HWM must:
- Be stored in `performance.performance_accounts.high_water_mark`
- Be updated only upward (it never decreases through normal operation)
- Be reset only by an explicit SuperAdmin action with audit log justification
- Be clearly visible to users in fee statements

---

## Rule 9 — Deposits Must Not Be Treated as Trading Profit

**Deposit amounts must never flow into profit calculations or fee basis calculations.**

In Model B, deposit events update `wallet.wallets.total_deposited`, not `performance.performance_accounts.total_realised_pnl`.

If you find any code where a deposit event modifies the performance account's P&L fields, this is a critical defect.

---

## Rule 10 — Audit Logs Must Be Created for All Trading, Subscription, Broker, Admin, and Revenue Events

**Every significant system action must produce an immutable audit log entry.**

Required audit events (minimum):
- `USER_REGISTERED`, `USER_EMAIL_VERIFIED`, `USER_SUSPENDED`
- `BROKER_CONNECTED`, `BROKER_DISCONNECTED`, `BROKER_RECONNECTED`
- `SUBSCRIPTION_ACTIVATED`, `SUBSCRIPTION_EXPIRED`, `SUBSCRIPTION_CANCELLED`
- `TRADING_SESSION_STARTED`, `TRADING_SESSION_STOPPED`, `TRADING_SESSION_SUSPENDED`
- `SIGNAL_GENERATED`, `SIGNAL_APPROVED`, `SIGNAL_REJECTED`
- `RISK_APPROVED`, `RISK_REJECTED`
- `TRADE_OPENED`, `TRADE_MODIFIED`, `TRADE_CLOSED`, `TRADE_REJECTED`
- `PERFORMANCE_FEE_CALCULATED`, `SETTLEMENT_COMPLETED`
- `KILL_SWITCH_ACTIVATED`, `KILL_SWITCH_DEACTIVATED`
- `ADMIN_ACTION` (any admin operation)

The `AuditModule` is an **append-only** service. It must never expose update or delete operations.

---

## Rule 11 — Broker Credentials Must Be Encrypted and Never Exposed to the Frontend

**Broker API keys, secrets, and access tokens must be encrypted at rest with AES-256-GCM envelope encryption, and must never appear in any API response.**

Required controls:
- `BrokerConnection.encryptedCredentials` is `@Exclude()` in all DTOs
- No controller or service may read and return raw credentials
- Decryption happens only within `BrokerService.getDecryptedCredentials()` for internal adapter use
- Decrypted credentials are never logged (check all logger calls in broker-related code)

**If a PR adds any path that returns credential data to a client, it must be blocked in code review.**

---

## Rule 12 — All Monetary Values Must Use Decimal-Safe Handling

**JavaScript `Number` type and Python `float` must never be used for financial calculations.**

Required:
- TypeScript: use `Decimal.js` for all arithmetic involving money, prices, lot sizes, P&L
- Python: use `decimal.Decimal` for all financial calculations
- Database: all monetary columns use `DECIMAL(18,8)` — never `FLOAT` or `DOUBLE PRECISION`
- API transport: monetary values serialised as strings to avoid IEEE 754 precision loss

```typescript
// WRONG:
const fee = profit * 0.20;

// CORRECT:
import Decimal from 'decimal.js';
const fee = new Decimal(profit).times('0.20').toFixed(8);
```

---

## Rule 13 — All Trading Actions Must Be Idempotent Where Possible

**Every order submission must carry an idempotency key. Duplicate submissions with the same key must return the existing result, not create a new order.**

Implementation requirements:
- `Trade.idempotencyKey` is a unique index in the database
- A Redis distributed lock is acquired before Trade record creation
- Broker adapter implementations must pass idempotency keys to the broker (via order comment or broker-native dedup field)
- The `DUPLICATE_ORDER` broker error must be handled by returning the existing trade, not raising an exception

---

## Rule 14 — Production Rollout Must Include Monitoring, Alerts, Rollback, and Incident Response

**No production deployment is complete without:**

1. Health check endpoints passing on all services
2. Grafana dashboards showing normal metrics
3. Alerting rules configured and tested
4. Rollback procedure documented and tested
5. Incident response runbook available
6. On-call engineer aware of the deployment

Deployment without these controls is not approved.

---

## Rule 15 — No Hardcoded Secrets in Source Code

**Secrets, API keys, database URLs, JWT keys, and encryption keys must never be hardcoded in source files, Dockerfiles, or configuration files committed to version control.**

Required:
- All secrets via environment variables
- `.env` files are `.gitignore`d
- `.env.example` provided with all keys but no values
- CI/CD secrets managed in GitHub Actions secrets or Vault
- Secret scanning runs on every commit (TruffleHog)

---

## Rule 16 — iRexPro Is a Global Platform — Never Hard-Code Country, Provider, or Currency

**The system must never be hard-coded to a single country, payment provider, SMS provider, or currency.**

Prohibited patterns:
```typescript
// WRONG — hardcoded provider
const stripe = new StripeAdapter();
await stripe.createSubscription(params);

// CORRECT — router selects based on user country
const provider = paymentProviderRouter.selectProvider(user.country, plan.currency);
await provider.createSubscription(params);
```

```typescript
// WRONG — hardcoded currency
const fee = realisedPnl * 0.20;  // assumes USD

// CORRECT — use plan's currency for fee records
const feeRecord = { currency: performanceAccount.currency, feeAmount: ... };
```

Any code that makes a single-country or single-provider assumption must be rejected in code review.

---

## Rule 17 — New Countries Must Be Enabled Via Configuration, Not Code

**Activating iRexPro in a new country requires:**
1. A `CountryConfig` record created or updated with `isSupported = true`
2. Legal sign-off for that jurisdiction documented in the compliance log
3. Payment provider routing configured for the country
4. SMS provider routing configured for the country
5. Broker availability configured for the country

**No code deploy is required to activate a new market.** Country configuration is data, not code.

**No new country is activated without legal clearance.**

---

## Rule 18 — Payment Provider Webhooks Must Validate Signatures Before Processing

**Every payment provider webhook endpoint must validate the provider-specific signature before any processing occurs.**

```typescript
// Step 1: Validate BEFORE parsing
const isValid = provider.validateWebhookSignature(rawBody, headers);
if (!isValid) {
  auditService.log('WEBHOOK_INVALID_SIGNATURE', { provider: providerId, ip });
  throw new UnauthorizedException();
}

// Step 2: Parse AFTER validation
const event = provider.parseWebhookEvent(rawBody, headers);

// Step 3: Process asynchronously via BullMQ
await webhookQueue.add('process-payment-event', event);
```

Webhooks must always use the raw body (not parsed JSON) for signature validation. Middleware that parses JSON before the webhook handler will invalidate the signature.

---

---

## Rule — TypeORM Entity Columns Must Always Declare Explicit PostgreSQL Types

**All `@Column` decorators must include an explicit `type` option. Do not rely on TypeORM's automatic type inference.**

### Why this rule exists

TypeScript's `reflect-metadata` emits the design-time type of a property as its JavaScript constructor (e.g., `String`, `Number`, `Boolean`). For **union types** such as `string | null`, `number | null`, `Date | null`, or `boolean | null`, TypeScript emits `Object` — not `String`, `Number`, etc. TypeORM cannot map `Object` to a PostgreSQL column type and throws `DataTypeNotSupportedError` at startup.

This was encountered during Sprint 5C stabilisation when `UserProfile.firstName: string | null` caused:
```
DataTypeNotSupportedError: Data type "Object" in "UserProfile.firstName" is not supported by "postgres" database.
```

### Rules

1. **Every `@Column` on a nullable/union-typed field must have an explicit `type`.**
2. **Every `@Column` on a non-nullable field should also have an explicit `type` for clarity.**
3. Never declare a column with only `nullable: true` and no `type` — TypeORM will infer `Object`.

### Required type mappings

| TypeScript type | `@Column` `type` |
|---|---|
| `string` (short text) | `'varchar'` with `length` |
| `string` (long text) | `'text'` |
| `string \| null` (short) | `'varchar'` + `nullable: true` |
| `string \| null` (long) | `'text'` + `nullable: true` |
| `number` (integer) | `'integer'` |
| `number \| null` | `'integer'` + `nullable: true` |
| `boolean` | `'boolean'` |
| `boolean \| null` | `'boolean'` + `nullable: true` |
| `Date \| null` | `'timestamptz'` + `nullable: true` |
| `string` (UUID FK) | `'uuid'` |
| `string \| null` (UUID FK) | `'uuid'` + `nullable: true` |
| `string` (money/decimal) | `'numeric'` with `precision` + `scale` |
| `string` (large integer) | `'bigint'` |
| `Record<string, any>` | `'jsonb'` |
| `Record<string, any> \| null` | `'jsonb'` + `nullable: true` |
| `string[]` | `'jsonb'` |
| `SomeEnum` | `'enum'` + `enum: SomeEnum` |
| `SomeEnum \| null` | `'enum'` + `enum: SomeEnum` + `nullable: true` |

### Correct examples

```typescript
// Nullable string — REQUIRED to have type: 'varchar'
@Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
firstName: string | null;

// UUID foreign key
@Column({ name: 'user_id', type: 'uuid' })
userId: string;

// Nullable UUID FK
@Column({ name: 'signal_id', type: 'uuid', nullable: true })
signalId: string | null;

// Money field — always numeric string, never JS float
@Column({ name: 'amount', type: 'numeric', precision: 20, scale: 8 })
amount: string;

// Nullable integer
@Column({ name: 'leverage', type: 'integer', nullable: true })
leverage: number | null;

// Boolean
@Column({ name: 'is_active', type: 'boolean', default: true })
isActive: boolean;

// JSONB
@Column({ name: 'metadata', type: 'jsonb', nullable: true })
metadata: Record<string, unknown> | null;
```

### Code Review Checklist additions

- [ ] Every new `@Column` has an explicit `type`
- [ ] No `@Column({ nullable: true })` without `type`
- [ ] Nullable fields use the correct nullable form of the type (e.g., `'uuid'` not `'varchar'` for UUID FKs)

---

---

## Rule N+1 — WebSocket Payload Safety (Sprint 6)

**WebSocket events MUST NEVER include:**
- Broker credentials or encrypted credential fields
- Raw access tokens or refresh tokens
- Full internal error stack traces
- Private keys, secrets, or API keys

**Allowed in WebSocket payloads:**
- Safe IDs (tradeId, sessionId, connectionId, signalId)
- Status strings, timestamps, reason codes
- User-facing messages (non-technical)
- Numeric values safe for display (prices, volumes, P&L)

**Implementation:** All payloads pass through `RealtimeService` methods which enforce this via typed interfaces. Direct `server.emit()` calls outside `RealtimeService` are prohibited.

---

## Rule N+2 — Strategy Orchestrator is Mandatory (Sprint 6)

**The AI Signal Service MUST forward all signals through `StrategyOrchestratorService.processSignal()`.**

No module may call `ExecutionService.executeTrade()` or `RiskService.validateProposedTrade()` based on a raw AI signal without passing through the Strategy Orchestrator first.

The Orchestrator enforces the full gate chain:
```
Signal structure → Confidence threshold → Session active → Subscription gate →
Broker connection → Risk Engine → Execution Engine
```

**The dev simulate-signal endpoint (`POST /ai/dev/simulate-signal`) is DISABLED in production.**

---

## Rule N+3 — DomainEventBus for Cross-Module Events (Sprint 6)

**Business modules (ExecutionModule, RiskModule, BrokerModule, TradingModule) MUST publish domain events via `DomainEventBus.publish()`, not by directly injecting `RealtimeService` or `RealtimeGateway`.**

This prevents circular dependency chains. `RealtimeService` subscribes to the event bus in `onModuleInit` and forwards events to WebSocket clients.

```typescript
// Correct
this.eventBus.publish(DomainEventType.TRADE_OPENED, userId, safePayload);

// Forbidden — creates circular dependency
this.realtimeService.emitToUser(userId, RealtimeEvent.TRADE_OPENED, payload);
```

---

---

## Rule 24 — Python AI Engine Safety Rules (Sprint 7+)

**The Python AI Engine (`services/ai-engine/`) is a signal producer only. It must never execute trades.**

Rules:
1. `AI_SIGNAL_MODE` must default to `paper`. Never default to `live`.
2. `BaselineXGBoostModel` (or any model) must have `approved_for_live=False` until a formal governance review.
3. All signals must be POSTed to NestJS `POST /ai/internal/signals` via `NestJsClient`.
4. `NestJsClient` must include the `x-irexpro-internal-api-key` header — never a user JWT.
5. Signal metadata must be sanitized before inclusion — `sanitize_metadata()` must be called.
6. `AI_SIGNAL_MODE=live` must be blocked in this sprint and must require explicit governance unlock.
7. Feature engineering must not use future data (lookahead bias is a critical defect — unit test required).
8. No real trained model weights may be committed to the repository.
9. Mock OHLCV data must be clearly labeled `source: mock_test_only` in all candles.
10. Redis cache must never store secrets, credentials, or tokens.

---

## Rule 25 — NestJS Internal API Key Guard

**The `POST /ai/internal/signals` endpoint must be protected by `InternalApiKeyGuard` only.**

Rules:
- `InternalApiKeyGuard` validates `x-irexpro-internal-api-key` header using `crypto.timingSafeEqual`.
- The endpoint must be annotated `@Public()` to bypass the global `JwtAuthGuard`.
- If `NESTJS_INTERNAL_API_KEY` is not configured, the guard must block all requests.
- The key value must never be logged.
- This endpoint is NOT a substitute for user authentication. It is service-to-service only.
- All signals received via this endpoint still flow through the full pipeline:
  `AiSignalService → StrategyOrchestrator → RiskEngine → ExecutionEngine`

---

## Code Review Checklist

Before approving any PR touching trading, risk, financial, payment, or regional logic:

- [ ] Risk Engine cannot be bypassed by this change
- [ ] No monetary calculations use native float/number arithmetic
- [ ] No broker credentials are exposed in any response or WebSocket payload
- [ ] Audit log entries are created for all state changes
- [ ] Idempotency is handled for any order-related changes
- [ ] Performance fee calculation is not affected by deposit events
- [ ] HWM logic is not changed without explicit review
- [ ] Unit tests cover all new rule branches in Risk Engine
- [ ] No "guaranteed profit" language in any user-facing string
- [ ] New env variables documented in `.env.example`
- [ ] No hardcoded country, currency, payment provider, or SMS provider
- [ ] Payment provider used via `IPaymentProvider` interface, not direct SDK call
- [ ] SMS sent via `ISmsProvider` interface, not direct provider SDK call
- [ ] Webhook handler validates signature before processing
- [ ] New country activation requires CountryConfig update, not code change
- [ ] WebSocket payloads use typed interfaces from `realtime-payloads.interface.ts`
- [ ] No direct AI signal → Execution bypass exists in the change
- [ ] Domain events published via `DomainEventBus`, not direct `RealtimeService` injection
- [ ] Dev-only endpoints check `NODE_ENV !== 'production'`
- [ ] Python AI engine `AI_SIGNAL_MODE` is `paper` (not `live`) in any new config or fixture
- [ ] No model approved for live trading without governance metadata confirmation
- [ ] `sanitize_metadata()` called before including metadata in any signal payload
- [ ] Feature engineering tests include anti-lookahead validation
