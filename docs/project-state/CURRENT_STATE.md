\# iRexPro Current Project State



\## Current Sprint Checkpoint

Last completed sprint: Sprint 16 — Subscription Checkout Idempotency + Pending Invoice Reuse.



Last verified status:

\- NestJS: 644 tests passing, 38 suites

\- No pending migrations (AddSubscriptionCheckoutDuplicateGuard1751400000000 applied)

\- No open handles

\- No Python files touched

\- SubscriptionsService.initiateCheckout no longer creates a new invoice/transaction on every call — reuses an existing DRAFT/ISSUED invoice + PENDING/PROCESSING transaction for the same (userId, planId, currency, countryCode, paymentPurpose) identity

\- An existing active provider session (PROCESSING + providerTransactionReference) is returned as-is — never a second provider session

\- DB-level partial unique index on payments.invoices backstops the app-level reuse check against real concurrent double-clicks; a losing 23505 is caught and safely resolved to the winner's invoice/transaction

\- Atomic conditional UPDATE (WHERE status IN (PENDING, FAILED)) claims a transaction before any provider call, preventing two concurrent requests from both creating a provider session for the same row

\- Optional Idempotency-Key support (header or body field) — same key+params replay the same result; same key+different params fails with 409; only a SHA-256 hash of the key is ever persisted, never the raw value

\- Active ACTIVE/TRIAL subscription for the same plan blocks a new checkout before any invoice/transaction is touched; a PAID invoice or SUCCEEDED transaction likewise blocks checkout

\- FAILED/CANCELLED/REFUNDED transactions supersede (cancel) the stale invoice and allow a fresh checkout attempt

\- Provider call failure reverts the transaction to PENDING (not FAILED) so a retry reuses it instead of creating a new invoice

\- Checkout still never activates a subscription, never trusts frontend success, and never marks anything paid — only a verified webhook does (Sprint 10-15 invariant unchanged and regression-tested)

\- Sprint 15 Paystack audit fixes (amount/currency webhook verification, Ghana live-provider routing) remain in place and regression-tested

\- No secrets (provider keys, idempotency keys, webhook secrets, Authorization header) in checkout responses, audit metadata, or providerPayloadSummary



\## Critical Safety Rules

\- No live broker withdrawals.

\- No auto-charge.

\- Do not mark invoice PAID without verified webhook.

\- Do not update high-water mark outside verified payment webhook.

\- Do not trust frontend payment success.

\- Do not charge deposits/top-ups.

\- Do not charge unrealised/open trades.

\- Do not charge demo/paper/backtest/mock trades.

\- Do not expose secrets, credentials, tokens, raw webhook payloads, card data, or mobile money PINs.

\- All money values must remain decimal-safe.

\- Paystack provider must fail closed unless PAYSTACK_ENABLED=true and a secret key is configured.

\- Paystack Transaction Verify (getTransactionStatus) is read-only confirmation only — never a substitute for webhook signature verification.



\## Completed Sprint Summary

\- Sprint 1: Architecture foundation

\- Sprint 2: Backend foundation

\- Sprint 3: Broker adapter / MetaTrader integration

\- Sprint 4: Risk engine

\- Sprint 5: Trade execution engine

\- Sprint 6: Realtime events + Strategy Orchestrator

\- Sprint 7: Python AI Signal Engine

\- Sprint 8: Market data ingestion + paper scheduler

\- Sprint 9: Backtesting + PaperBrokerAdapter

\- Sprint 10: Subscription billing + payment gateway foundation

\- Sprint 10 audit: raw-body webhook, manual webhook risk, invoice audit fixed

\- Sprint 11: Performance fee + high-water mark engine

\- Sprint 11 audit: double-charge risk, wrong-plan policy leak, broker-scope leak fixed

\- Sprint 12: Broker trade reconciliation → realised P\&L ledger entries

\- Sprint 12 audit: currency minor-units + partial-failure ledger backfill fixed

\- Sprint 13: Performance fee billing cycle orchestrator

\- Sprint 13 audit: failed reconciliation treated as success fixed; null-broker duplicate lookup fixed

\- Sprint 14: Performance fee invoice checkout + provider assignment

\- Sprint 15: Paystack sandbox checkout integration (subscription + performance-fee) — webhook-only paid/HWM path preserved

\- Sprint 16: Subscription checkout idempotency + pending invoice reuse — DB-level duplicate guard, atomic provider-session claim, optional Idempotency-Key support



\## Current Main Modules

\- apps/api/src/modules/payments

\- apps/api/src/modules/subscriptions

\- apps/api/src/modules/performance-fees

\- apps/api/src/modules/performance-billing

\- apps/api/src/modules/broker-reconciliation

\- apps/api/src/modules/broker

\- apps/api/src/modules/trading

\- apps/api/src/modules/risk

\- services/ai-engine



\## Model Strategy

\- Main implementation: Claude Sonnet 5

\- Fallback: Claude Sonnet 4.6

\- Small fixes/docs: Sonnet 4.5 or Composer

\- Opus 4.8 only for rare final/deep audits because it consumes too many tokens.

