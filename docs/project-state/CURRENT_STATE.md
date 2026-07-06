\# iRexPro Current Project State



\## Current Sprint Checkpoint

Last completed sprint: Sprint 17 — Stripe Sandbox Checkout Integration (subscription + performance-fee, webhook-only paid/HWM path preserved).



Last verified status:

\- NestJS: 734 tests passing, 44 suites (added stripe.provider.spec.ts, stripe-http.client.spec.ts, webhook-processor.stripe.spec.ts, subscriptions.service.stripe.spec.ts, performance-fee-payment.stripe.spec.ts + Stripe describe blocks in payment-routing.service.spec.ts)

\- No pending migrations (reuses existing payments schema — no new migration this sprint)

\- No open handles

\- No Python files touched

\- StripePaymentProvider is now a real sandbox implementation of IPaymentProvider (previously a fail-closed placeholder) — createCheckoutSession (Checkout Session, mode: payment), verifyWebhookSignature (HMAC-SHA256 over "${timestamp}.${rawBody}", Stripe-Signature header, 300s replay tolerance), parseWebhookEvent (checkout.session.completed/payment_intent.succeeded -> success; checkout.session.expired/payment_intent.payment_failed -> failed), getTransactionStatus (Checkout Session/PaymentIntent retrieval)

\- StripeHttpClient (new, injectable native fetch wrapper, no SDK) sends application/x-www-form-urlencoded request bodies matching Stripe's documented REST format

\- Stripe fails closed unless STRIPE_ENABLED=true and STRIPE_SECRET_KEY is configured; app boots normally with no Stripe credentials set

\- Subscription checkout and performance-fee checkout both route to Stripe with zero business-logic changes — both already depend only on the generic IPaymentProvider interface; Sprint 16 reuse/idempotency/concurrency logic applies unchanged

\- Checkout never activates a subscription, marks an invoice/assessment paid, creates a FEE_PAID ledger entry, or updates HWM — only a verified Stripe webhook does

\- Provider routing: US/GB already listed stripe first in CountryConfig.enabledPaymentProviders — no seed changes needed; Paystack remains the auto-routed live choice for GH/NG/ZA when both providers are configured

\- GET /payments/providers exposes no Stripe secrets (secret key, publishable key, webhook secret) — only isLive/isSandbox and public capability fields

\- No secrets (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, Authorization header, raw webhook payload, card data) in checkout responses, logs, errors, or audit metadata

\- Flutterwave, Hubtel, PayPal, Wise, and Braintree remain untouched fail-closed placeholders — explicitly out of scope for this sprint

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

\- AUDIT FIX: the 23505-unique-violation recovery path could re-throw a raw QueryFailedError to the API caller in a narrow race window (winner's invoice committed, its transaction not yet) — now converted to a safe ConflictException asking the caller to retry shortly

\- AUDIT FIX: idempotency-key fingerprint now also binds paymentPurpose and amountMinor — a mid-flight price change with the same idempotency key now fails closed (409) instead of replaying a stale-priced session

\- AUDIT FIX: an empty/whitespace-only Idempotency-Key header no longer shadows a valid idempotencyKey body field



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

\- Stripe provider must fail closed unless STRIPE_ENABLED=true and a secret key is configured.

\- Stripe webhook signature verification must fail closed if the Stripe-Signature header, raw body, or STRIPE_WEBHOOK_SECRET is missing.

\- Stripe Checkout Session/PaymentIntent retrieval (getTransactionStatus) is read-only confirmation only — never a substitute for webhook signature verification.



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

\- Sprint 16 audit: raw DB error leak on a narrow 23505 race, idempotency fingerprint missing paymentPurpose/amount, empty Idempotency-Key header precedence bug — all fixed

\- Sprint 17: Stripe sandbox checkout integration (subscription + performance-fee) — webhook-only paid/HWM path preserved; zero business-logic changes required in SubscriptionsService/PerformanceFeePaymentService/WebhookProcessorService



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

