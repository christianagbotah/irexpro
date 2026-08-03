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

## Rule 27 — Backtesting Safety (Sprint 9+)

**Backtest results are simulated only. No performance guarantees.**

Rules:
1. `BacktestResult.simulated_only` must always be `True`.
2. `BacktestEngine` must never call `NestJsClient.publish_signal()`.
3. `BacktestEngine` must never call any broker or execution API.
4. No lookahead bias: signal generation at index `i` uses only `candles[:i]`.
5. Same-candle SL/TP: stop-loss assumed to trigger first (conservative, documented).
6. Mock backtests are blocked in production unless `AI_ALLOW_MOCK_MARKET_DATA=true`.
7. `PaperBrokerAdapter.setMode(LIVE)` must be silently rejected.
8. Backtest metrics must not be presented as guaranteed future performance.

---

## Rule 26 — Market Data & Scheduler Safety (Sprint 8+)

**Python must never access broker credentials. All OHLCV flows through NestJS.**

Rules:
1. `BrokerMarketDataProvider` calls `GET /market-data/internal/ohlcv` only — never MetaAPI directly.
2. `AI_SCHEDULER_ENABLED` and `AI_ENGINE_SCHEDULER_ENABLED` default to `false`.
3. Scheduled generation is **paper mode only** — reject `mode=live` at scheduler endpoints.
4. Mock market data is blocked in production unless `AI_ALLOW_MOCK_MARKET_DATA=true`.
5. Redis OHLCV cache key format: `ai:ohlcv:{source}:{instrument}:{timeframe}` — never cache secrets.
6. Offline training (`app/domain/training/`) is research-only — no startup training, no live approval.
7. Trading session start/stop must not fail if AI engine notification fails (log warning only).

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

## Rule 17 — Payment Webhooks Must Verify Signatures Before Processing

**Webhook endpoints must verify provider signatures before changing any subscription or payment state.**

- `verifyWebhookSignature(rawBody, headers)` must be called and must return `true` before any state change.
- Placeholder providers fail closed — `verifyWebhookSignature` returns `false` until live credentials are configured.
- Invalid signatures must be audit-logged as `PAYMENT_WEBHOOK_SIGNATURE_FAILED`.

**Why:** An unsigned webhook could be a replay attack or forged event that falsely activates a subscription.

---

## Rule 18 — Frontend Payment Success Never Activates Subscriptions

**Subscription status must only change after server-side webhook verification.**

- Only `WebhookProcessorService.processWebhook()` may call `activateSubscriptionFromPayment()`.
- Checkout flow returns a URL/sessionId for external completion — return URL is not trusted.

---

## Rule 19 — ManualPaymentProvider Is Never Available for Public Checkout

**`PaymentRoutingService.routeForCheckout()` must never select the ManualPaymentProvider.**

- Filtered out by `providerId === 'manual'` in the routing service.
- Admin-supervised activation only via `POST /subscriptions/dev/manual-activate`.

---

## Rule 20 — All Monetary Values Are Decimal-Safe

**No monetary value may be stored as a float or JavaScript `number` in any database column.**

- Use `bigint` columns for all minor-unit amounts (stored as strings by TypeORM).
- Convert to display values at the presentation layer only.

---

## Rule 21 — Performance Fees Apply Only to Realised Profit Above the High-Water Mark

**Performance fee calculations must strictly follow:**

1. **Realised only** — fee applies solely to closed-trade P&L. Open, floating, or unrealised positions are NEVER counted.
2. **Deposits excluded** — capital added by the user (deposits, top-ups, bonuses, credits) does NOT count as profit.
3. **HWM gating** — fee applies only to profit above the previous high-water mark. No profit above HWM → zero fee.
4. **No double-charging** — HWM updates ONLY after the fee assessment is confirmed PAID via verified webhook.
5. **No auto-withdrawal** — the platform NEVER automatically withdraws fees from a user's broker account. Invoice only.
6. **No fee without subscription** — a valid active subscription with a performance fee policy is required.
7. **No fee on demo/paper/backtest** — results from demo brokers, paper trading, or backtest runs must NEVER generate fee entries.
8. **Zero-fee assessment** — when profit is not above HWM, assessment status stays DRAFT; no invoice is created.
9. **BigInt arithmetic** — all fee calculations use BigInt to avoid floating-point precision loss.
10. **Audit trail** — every assessment is reproducible from its `calculationMetadata`; every state change is audit-logged.

---

## Rule 22 — Billing Period Must Respect Plan Interval

**`handlePaymentSucceeded` must use `plan.billingInterval` to compute `periodEnd`.**

- MONTHLY → +1 month
- QUARTERLY → +3 months
- ANNUAL → +1 year
- Plan not found → safe fallback to MONTHLY with a warning log

---

## Rule 23 — Webhook Idempotency Is Status-Aware

**When a duplicate webhook arrives (unique constraint violation on providerEventId):**

- `processed=true` → return idempotent success immediately, no reprocessing.
- `processed=false` → safe retry: load existing record and continue processing.
- Either path must NOT double-activate subscriptions or double-charge fees.

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
- [ ] Payment webhook verifies signature BEFORE any state change
- [ ] Subscription activated ONLY via verified webhook — never frontend callback
- [ ] ManualPaymentProvider not routable via PaymentRoutingService.routeForCheckout()
- [ ] No raw card data stored (ever)
- [ ] No provider secrets in logs, responses, tests, or Swagger
- [ ] All monetary values stored as bigint strings (minor units) — never float
- [ ] providerPayloadSummary only — never full raw payload (may contain secrets)
- [ ] Webhook idempotency: check providerEventId before processing
- [ ] Performance fee not assessed on deposits, top-ups, bonuses, unrealised P&L, or demo/backtest results
- [ ] Performance fee HWM updated ONLY after confirmed payment (status=PAID)
- [ ] No automatic broker withdrawal for performance fees — invoice only
- [ ] Performance fee invoice created only when feeAmount > 0
- [ ] Billing period computed from plan.billingInterval (not hardcoded)
- [ ] Duplicate webhook with processed=false → retry safely, not silently ignored
- [ ] Broker reconciliation triggered only by admin/system — never auto-started
- [ ] Broker reconciliation never creates performance fee assessments or invoices automatically
- [ ] Broker reconciliation never triggers live broker withdrawals
- [ ] Only LIVE broker connections (accountType=LIVE) are used for fee reconciliation
- [ ] Demo, paper, backtest, and mock trades are NEVER fee-eligible
- [ ] Broker account balance is NEVER used as fee basis — only reconciled closed trades
- [ ] BrokerReconciledTrade deduplication enforced by (userId, brokerConnectionId, brokerTradeId)
- [ ] netRealisedPnl = grossRealisedPnl + commission + swap — do not double-subtract
- [ ] No raw broker payloads stored in BrokerReconciledTrade or audit logs
- [ ] Reconciliation time window must be ≤ 90 days, fromTime < toTime, no future toTime

## Billing Cycle Rules (Sprint 13)

- [ ] Billing cycle workflow: reconcile → assess → invoice — do NOT skip steps
- [ ] Only ADMIN/SUPER_ADMIN may create, run, or cancel billing cycles
- [ ] `PerformanceFeeBillingCycleService` must not calculate fees directly — delegate to `PerformanceFeeService`
- [ ] Billing cycle state machine: INVOICED / NO_FEE_DUE / CANCELLED are final — never rerun
- [ ] FAILED billing cycles may be retried safely — retry must not duplicate reconciliation ledger entries
- [ ] Never update HWM from billing cycle code — HWM updates only via `markAssessmentPaid()` in webhook handler
- [ ] Never auto-charge users — invoice is created; payment is confirmed via verified webhook only
- [ ] Do not create invoice when feeAmount = 0 — mark cycle NO_FEE_DUE instead
- [ ] errorSummary must contain only a short message string (≤500 chars) — no stack trace, no credentials
- [ ] Duplicate cycle for same user/broker/period must throw ConflictException (DB partial unique indexes enforce this)
- [ ] Billing cycle `metadata` must never contain broker credentials, provider secrets, or raw payloads

## Performance Fee Payment Rules (Sprint 14)

- [ ] Checkout initiation must NEVER mark an invoice PAID, an assessment PAID, create a FEE_PAID ledger entry, or update HWM
- [ ] A verified provider webhook is the ONLY path to paid state / HWM update — never trust frontend success
- [ ] Reuse the existing PENDING performance-fee `PaymentTransaction` — never create a duplicate payable transaction for the same invoice
- [ ] An already-`SUCCEEDED` transaction must reject re-checkout; an in-progress non-`manual` session must be reused idempotently
- [ ] Only `ISSUED`/`OVERDUE` performance-fee invoices with an `INVOICED` assessment are payable
- [ ] Route via `PaymentRoutingService` only — the `manual` provider is DEV/TEST and must never be a public checkout provider
- [ ] Provider placeholders must fail closed (unconfigured → `NotImplementedException` → sanitised 400); invoice stays payable for retry
- [ ] Normal users may list/view/pay only their own performance-fee invoices; cross-user access → 403; admins may act on any
- [ ] Checkout responses, `providerPayloadSummary`, and audit metadata must contain no secrets, tokens, raw payloads, card data, or PINs
- [ ] All persisted money values remain bigint minor-unit strings

## Paystack Sandbox Integration Rules (Sprint 15)

- [ ] `PaystackPaymentProvider` must fail closed when `PAYSTACK_ENABLED` is not `'true'` or `PAYSTACK_SECRET_KEY` is missing — `isLive` is only `true` when both conditions hold
- [ ] `PAYSTACK_SECRET_KEY` / `PAYSTACK_WEBHOOK_SECRET` must never be logged, returned in an API response, or included in any thrown error message
- [ ] `createCheckoutSession()` must NEVER mark an invoice, subscription, or performance-fee assessment paid — it only returns a checkout URL/reference
- [ ] `verifyWebhookSignature()` must fail closed (return `false`, never throw) on a missing signature header, missing secret, missing raw body, or any crypto/parsing error
- [ ] Webhook signature verification uses HMAC-SHA512 of the **raw** request body against `x-paystack-signature`, compared with `crypto.timingSafeEqual` — never a plain `===` string comparison
- [ ] `parseWebhookEvent()` must never persist the raw webhook payload — only a whitelisted metadata subset (`invoiceId`, `subscriptionId`, `assessmentId`, `paymentPurpose`, `userId`, `planId`, `internalTransactionId`) and safe scalar fields
- [ ] Paystack's Verify Transaction endpoint (`getTransactionStatus`) is read-only server-side confirmation only — it must never replace webhook signature verification and must never itself mark anything paid
- [ ] The verified `charge.success` webhook remains the ONLY path that activates a subscription or marks a performance-fee assessment/invoice paid — Paystack checkout initiation and frontend callbacks are never trusted
- [ ] No Paystack SDK dependency — use the injectable `PaystackHttpClient` (native `fetch` + `AbortController` timeout), consistent with `AiEngineClient`
- [ ] `PaystackHttpClient` must never log the `Authorization` header, and must sanitise/length-cap any provider-supplied error message before it is returned or logged
- [ ] Tests for Paystack must mock `PaystackHttpClient`/`fetch` — never call the live Paystack network

## Sprint 15 Payment/Security Audit Fixes (2026-07-06)

- [ ] `WebhookProcessorService.handlePaymentSucceeded()` MUST verify that the webhook-reported `amountMinor` and `currency` exactly match the expected `PaymentTransaction` (BigInt/string comparison, never floats, case-insensitive currency) BEFORE marking anything paid — a matching `providerTransactionReference` alone is not sufficient. Missing amount/currency on either side fails closed. A mismatch logs a `CRITICAL`-severity `PAYMENT_FAILED` audit entry (`reason: 'AMOUNT_OR_CURRENCY_MISMATCH'`) and leaves the transaction/invoice/subscription/assessment untouched.
- [ ] `PaymentRoutingService.routeForCheckout()` auto-routing (no explicit `provider` preference) MUST prefer a `isLive === true` candidate among all providers enabled for a country/currency, regardless of list order in `CountryConfig.enabledPaymentProviders` — otherwise a permanently non-functional placeholder listed earlier (e.g. `hubtel` before `paystack` for Ghana) silently blocks checkout for that country even when a real provider is fully configured. Falls back to the first matching candidate (existing placeholder behaviour) only when no enabled provider is live.

## Subscription Checkout Idempotency + Pending Invoice Reuse Rules (Sprint 16)

- [ ] `SubscriptionsService.initiateCheckout()` MUST reuse an existing `DRAFT`/`ISSUED` invoice with a `PENDING`/`PROCESSING` `PaymentTransaction` for the same `(userId, planId, currency, countryCode, paymentPurpose)` identity instead of creating a new invoice/transaction — never create a second pending checkout for the same identity.
- [ ] An existing `PROCESSING` transaction that already has an active provider session (`providerTransactionReference` + `checkoutUrl`/`sessionId` in `providerPayloadSummary`) MUST be returned as-is — `provider.createCheckoutSession()` must never be called a second time for the same transaction.
- [ ] An `ACTIVE`/`TRIAL` subscription still within its current period for the same plan MUST block a new checkout (`409 Conflict`) before any invoice/transaction lookup or creation.
- [ ] A `PAID` invoice or `SUCCEEDED` transaction MUST block checkout — never reused, never recreated.
- [ ] A mismatch in amount, currency, or plan between the checkout request and an existing pending invoice MUST NOT reuse that invoice — a fresh invoice/transaction pair is created instead.
- [ ] `FAILED`/`CANCELLED`/`REFUNDED` transactions MUST NOT be reused directly — the stale invoice is marked `CANCELLED` (superseded) and a new invoice/transaction pair is created.
- [ ] Before calling any payment provider, the transaction MUST be atomically claimed via a conditional `UPDATE ... WHERE status IN ('PENDING', 'FAILED')` to `PROCESSING` — if the claim affects zero rows, another request won the race; the current request must not call the provider and must instead return the winner's session or a safe retry response.
- [ ] A provider call failure MUST revert the transaction to `PENDING` (never `FAILED`) so it remains retryable without spawning a duplicate invoice, and MUST NOT create an additional invoice or activate a subscription.
- [ ] A partial unique index on `payments.invoices` (`AddSubscriptionCheckoutDuplicateGuard` migration) is the authoritative DB-level guard against two truly concurrent checkout requests; a Postgres `23505 unique_violation` on invoice creation MUST be caught and resolved by re-reading and reusing the winning invoice/transaction — never surfaced as a raw 500 error.
- [ ] An optional `Idempotency-Key` header (or `idempotencyKey` DTO field) MUST only ever store a SHA-256 hash (never the raw key) plus a SHA-256 fingerprint of the checkout parameters, both in the existing `Invoice.metadata` JSONB column — no schema change for this feature.
- [ ] Same idempotency key + same checkout parameters MUST replay the same invoice/transaction/session result; same key + different parameters MUST fail safely with `409 Conflict` and create nothing.
- [ ] Requesting a different provider than an existing transaction's provider MUST be rejected (`409 Conflict`) when a real `providerTransactionReference` already exists — a live provider session must never be silently abandoned. Provider switching is only allowed when no session reference exists yet.
- [ ] Checkout responses, `providerPayloadSummary`, and audit metadata for reuse/replay paths must contain no provider secrets, authorization headers, raw provider responses, card data, mobile money PINs, or tokens — identical requirement to net-new checkout.
- [ ] Checkout MUST still never activate a subscription, mark an invoice `PAID`, or mark a transaction `SUCCEEDED` — a verified webhook remains the only path, unchanged by this sprint.
- [ ] This reuse/idempotency behaviour lives entirely in `SubscriptionsService` (provider-agnostic via `IPaymentProvider`) and applies identically to every provider — no provider-specific changes are permitted to implement it.

## Sprint 16 Payment/Idempotency/Security Audit Fixes (2026-07-06)

- [ ] `SubscriptionsService.createInvoiceAndTransaction()`'s 23505-unique-violation recovery MUST NEVER re-throw the raw `QueryFailedError` to the caller. If the re-read after losing the race returns `'supersede'` or `'none'` (e.g. the winning invoice insert committed but its transaction insert — a separate, non-atomic write — has not committed yet), the caller must receive a safe `ConflictException` asking them to retry shortly, never a raw database error.
- [ ] The idempotency-key fingerprint MUST include every parameter that affects what gets charged or which session is returned: `userId`, `planId`, `currency`, `countryCode`, `paymentPurpose`, `amountMinor`, and the explicitly requested `provider`. Omitting `paymentPurpose`/`amountMinor` would let a mid-flight price change silently replay a stale-priced session under the same idempotency key instead of failing safely.
- [ ] The `Idempotency-Key` header takes precedence over the `idempotencyKey` body field only when the header is present AND non-empty after trimming — an empty/whitespace-only header must fall back to the body field, never silently discard it.

## Stripe Sandbox Integration Rules (Sprint 17)

- [ ] `StripePaymentProvider` must fail closed when `STRIPE_ENABLED` is not `'true'` or `STRIPE_SECRET_KEY` is missing — `isLive` is only `true` when both conditions hold
- [ ] `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` must never be logged, returned in an API response, or included in any thrown error message
- [ ] `createCheckoutSession()` must NEVER mark an invoice, subscription, or performance-fee assessment paid, never create a `FEE_PAID` ledger entry, and never update the high-water mark — it only returns a hosted Checkout Session URL/session id
- [ ] `verifyWebhookSignature()` must fail closed (return `false`, never throw) on a missing `Stripe-Signature` header, missing `STRIPE_WEBHOOK_SECRET`, missing raw body, malformed header, or any crypto/parsing error
- [ ] Webhook signature verification computes HMAC-SHA256 over `"${timestamp}.${rawBody}"` (the **raw** request body, never re-serialized JSON) and compares against every `v1` value in the header using `crypto.timingSafeEqual` — never a plain `===` string comparison — and enforces a 300-second timestamp tolerance to reject stale/replayed events
- [ ] `parseWebhookEvent()` must never persist the raw webhook payload, `payment_method_details`, or any card data — only a whitelisted metadata subset (`invoiceId`, `subscriptionId`, `assessmentId`, `paymentPurpose`, `userId`, `planId`, `internalTransactionId`) and safe scalar fields
- [ ] Stripe's Checkout Session/PaymentIntent retrieval (`getTransactionStatus`) is read-only server-side confirmation only — it must never replace webhook signature verification and must never itself mark anything paid
- [ ] The verified `checkout.session.completed`/`payment_intent.succeeded` webhook remains the ONLY path that activates a subscription or marks a performance-fee assessment/invoice paid — Stripe checkout initiation, `STRIPE_SUCCESS_URL`/`STRIPE_CANCEL_URL` redirects, and frontend callbacks are never trusted
- [ ] No Stripe SDK dependency — use the injectable `StripeHttpClient` (native `fetch` + `AbortController` timeout, `application/x-www-form-urlencoded` request bodies), consistent with `PaystackHttpClient`/`AiEngineClient`
- [ ] `StripeHttpClient` must never log the `Authorization` header, and must sanitise/length-cap any provider-supplied error message before it is returned or logged
- [ ] Tests for Stripe must mock `StripeHttpClient`/`fetch` — never call the live Stripe network
- [ ] Flutterwave, Hubtel, PayPal, Wise, and Braintree remain out of scope for this sprint and must not be implemented as part of Stripe integration work

---

## Rule 19 — UI/UX Design System Compliance

> **Mandatory reference:** `docs/design/IREXPRO_UI_UX_DESIGN_SYSTEM.md`

Every new or modified iRexPro interface — web, admin, or mobile — MUST conform to the
iRexPro UI/UX Design System document. This is not optional.

### Requirements

1. **Read the design system document** before starting any frontend work
2. **Reuse existing shared components** — do not duplicate patterns across pages
3. **Use established design tokens** — do not invent new colors, spacing, radii, or shadows
4. **Design all applicable states** — loading, empty, error, success, warning, disabled,
   offline, degraded
5. **Verify responsive behavior** at 360px, 390px, 768px, 1024px, 1440px
6. **Verify accessibility** — keyboard, screen reader, contrast, ARIA, focus management
7. **Never expose raw backend errors** — use `mapApiError()` for all error messages
8. **Never use browser `alert()` or `confirm()`** — use toast notifications and ConfirmDialog
9. **Preserve trading-safety wording** — AI signal → risk gate → execution → broker adapter.
   AI must never directly execute broker orders.
10. **Include UI/UX verification** in the final feature report using the design-review checklist

### Prohibited

- ❌ Pages that are merely functional without professional visual treatment
- ❌ Generic Bootstrap-style layouts or default browser controls
- ❌ Inconsistent page designs that don't match the iRexPro design system
- ❌ Casino-style, neon, or gambling aesthetics
- ❌ Aggressive profit-focused messaging or guaranteed-returns language
- ❌ Raw backend errors, SQL messages, stack traces, or credentials in the UI
- ❌ Desktop-only interactions without mobile alternatives
- ❌ Postponing accessibility as a separate task

### Definition of Done

No frontend page or component is complete unless:
- Business logic works
- The interface is professionally designed per the design system
- Shared components are reused
- All applicable states are handled
- Responsive behavior is verified
- Accessibility is verified
- Safety wording is correct
- Raw errors and secrets are never exposed
- Tests and production builds pass
- The final report includes UI/UX verification
