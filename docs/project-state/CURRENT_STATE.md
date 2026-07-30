\# iRexPro Current Project State



\## Current Sprint Checkpoint

Current sprint: Sprint 19 — Production Deployment Foundation (IN PROGRESS).

Last completed sprint: Sprint 18 — Payment Transaction Reference Uniqueness + Metadata Consistency Hardening (PASS, merged to `main`, tagged `sprint-18-complete`).

Previous: Sprint 17 audit — Stripe Sandbox Checkout Integration (PASS, no fixes required).


\## Sprint 19 — Production Deployment Foundation (in progress)

Sprint 19 prepares iRexPro for safe VPS / Webuzo production deployment. It is a **documentation and deployment-foundation sprint only** — it does NOT change any production logic, payment-state transitions, webhook processing, broker credential handling, risk engine rules, execution engine rules, or the AI-to-trade flow. All Sprints 10–18 safety invariants remain exactly as they were.

Deliverables (Sprint 19 branch `sprint-19-production-deployment`):

\- Production deployment runbook for VPS / Webuzo: `docs/runbooks/production-deployment-vps-webuzo.md` — covers system requirements, PostgreSQL setup, Redis setup, environment variable setup, build process, migration run process, PM2/systemd process management, Nginx reverse proxy + TLS, health-check verification, logs, rollback process, and a full deployment checklist.

\- Secrets policy runbook: `docs/runbooks/secrets-never-committed.md` — the authoritative list of files and values that must never be committed to git, with a pre-push self-check.

\- PM2 ecosystem example: `infrastructure/pm2/ecosystem.config.js` — manages both the NestJS API and the Python AI engine from one config. Contains NO secrets (all read from gitignored `.env` files).

\- systemd unit examples: `infrastructure/systemd/irexpro-api.service` and `infrastructure/systemd/irexpro-ai-engine.service` — alternative to PM2 for teams that prefer native systemd. Contain NO secrets.

\- `.env.example` improvements (both `apps/api/` and `services/ai-engine/`) — added production-deployment pointers and per-variable production notes. No real secrets added; every value remains a `CHANGE_ME_*` / `PLACEHOLDER` / `dev_*` placeholder.

\- `.gitignore` hardened — added `*.egg-info/` to prevent Python package metadata from being tracked. Untracked 5 pre-existing `irexpro_ai_engine.egg-info/` files (kept on disk).

\- This document + `IMPLEMENTATION_ROADMAP.md` updated to reflect Sprint 19 start.

Sprint 19 safety rules preserved (no regressions from Sprints 10–18):

\- Checkout never marks invoice/transaction/subscription/assessment/HWM paid — only a verified provider webhook does.
\- Only a verified provider webhook may confirm payment.
\- Amount and currency must match before confirming payment.
\- HWM may update only through the verified performance-fee webhook success path; HWM cannot regress (Sprint 18 `max()` semantics).
\- `PerformanceFeeService` exposes no method that transitions an assessment to PAID or updates the HWM.
\- DB-level uniqueness on `(provider, provider_transaction_reference)` is enforced; 23505 is caught safely and never leaks.
\- Broker credentials remain AES-256-GCM encrypted; never in responses, logs, audit metadata, WebSocket events, or errors.
\- AI never executes broker orders directly.
\- Risk approval remains mandatory and non-bypassable.
\- All persisted money values remain bigint minor-unit strings. No floating-point money.
\- No demo-data / database-failure fallback in any production path. No SQLite. No Fovi-style Next.js API routes or localStorage auth.
\- Production failures fail closed.

No production logic, migrations, payment-state transitions, webhook processing, broker, risk, execution, or AI code was changed in Sprint 19. NestJS tests remain at 739 passing across 44 suites (unchanged from Sprint 18).


\## Sprint 18 — Payment Transaction Reference Uniqueness + Metadata Consistency Hardening

Sprint 18 hardens the payment-transaction reference uniqueness boundary and the performance-fee high-water-mark safety invariant. It is a defence-in-depth + consistency sprint — no new payment-state transitions were introduced and the webhook-only paid-state invariant is preserved unchanged.

\- DB-level uniqueness guard on `(provider, provider_transaction_reference)` is now enforced via the pre-existing migration `1751500000000-AddPaymentTransactionReferenceUniqueGuard` (partial unique index `ux_payment_transactions_provider_reference`, scoped `WHERE provider_transaction_reference IS NOT NULL AND <> ''`). The migration was already on disk and correct; Sprint 18 verified it, added tests around it, and documented the pre-migration duplicate-check runbook.

\- Both subscription checkout (`SubscriptionsService.initiateCheckout`) and performance-fee checkout (`PerformanceFeePaymentService.initiatePerformanceFeeCheckout`) already caught the 23505 unique-violation from this guard (Sprint 18 PART C): they release the processing claim back to PENDING, audit at CRITICAL severity with `reason: 'PROVIDER_REFERENCE_CONFLICT'`, and throw a sanitized `ConflictException`. They NEVER mark the invoice/transaction/assessment/subscription paid and never leak the raw `QueryFailedError` / constraint name. Sprint 18 added regression tests proving this for both flows.

\- Performance-fee checkout metadata now includes `transactionId` in BOTH the provider-bound `createCheckoutSession` metadata AND the stored `providerPayloadSummary` — consistent with subscription checkout. (The `createCheckoutSession` metadata already had `transactionId` since Sprint 14; Sprint 18 added it to `providerPayloadSummary` for debug-metadata parity and added a regression test.) No payment state transitions were changed.

\- High-water-mark anti-regression hardening: `WebhookProcessorService.handlePerformanceFeePaymentSucceeded` now updates the HWM using `max(currentHighWaterMark, endingRealisedBalance)` via BigInt comparison, so the HWM can never move downward even if a future change to the outstanding-assessment guard, a reconciliation backfill, or a manually-inserted assessment produces an `endingRealisedBalance` below the stored peak. The audit metadata now records `endingRealisedBalance` and a `hwmRegulated` flag so operators can see when the max() guard held the HWM at the old peak.

\- Removed the previously-orphaned `PerformanceFeeService.markAssessmentPaid()` method. It transitioned an assessment to PAID and updated the HWM directly, bypassing the verified payment-webhook path. It had NO production callers (the webhook processor inlines its own HWM logic), but its existence was a latent safety hazard. The invariant "HWM may update only through the verified performance-fee webhook success path" is now enforced structurally — `PerformanceFeeService` exposes NO method that writes `currentHighWaterMark` or transitions an assessment to PAID. The sole production write site is `WebhookProcessorService.handlePerformanceFeePaymentSucceeded`.

\- Repository hygiene: 541 tracked `dist/` build artifacts removed from git tracking (`git rm -r --cached apps/api/dist`). The `.gitignore` `dist/` entry (already present) now protects the working tree. No source code, migrations, tests, or docs were removed.

\- Sprint 18 tests added (all passing): HWM cannot regress after verified payment; HWM advances normally when endingRealisedBalance exceeds the old peak; `markAssessmentPaid` is not exposed by `PerformanceFeeService`; performance-fee checkout metadata includes `transactionId`; performance-fee `providerPayloadSummary` includes `transactionId`; DB unique-violation on `providerTransactionReference` is caught safely in performance-fee checkout (never marks paid, releases claim, audits CRITICAL, sanitized conflict, no error leak); DB unique-violation on `providerTransactionReference` is caught safely in subscription checkout (never marks paid, never activates subscription, releases claim, audits CRITICAL, sanitized conflict).

\- Existing webhook-only paid-state invariants remain intact and regression-tested: checkout never marks paid; only a verified provider webhook confirms payment; amount + currency must match; HWM updates only after confirmed performance-fee payment.

\- Pre-migration runbook added: `docs/runbooks/sprint-18-provider-reference-unique-guard.md` documents the duplicate-check SQL operators must run before applying migration `1751500000000` to any database with existing historical transaction data.

\- No Python files touched. No new migrations created. No new libraries installed.



Last verified status (Sprint 18):

\- NestJS: 739 tests passing, 44 suites (Sprint 17 baseline was 734; added stripe.provider.spec.ts, stripe-http.client.spec.ts, webhook-processor.stripe.spec.ts, subscriptions.service.stripe.spec.ts, performance-fee-payment.stripe.spec.ts + Stripe describe blocks in payment-routing.service.spec.ts). Sprint 18 added 8 tests and removed 3 obsolete markAssessmentPaid tests, resulting in 739 passing NestJS tests across 44 suites.

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

\- Sprint 17 AUDIT (2026-07-06) — PASS, no code fixes required. Reviewed config fail-closed behaviour, StripeHttpClient, createCheckoutSession request shape/metadata, webhook signature verification (HMAC-SHA256, timestamp tolerance, timingSafeEqual, never throws), parseWebhookEvent mapping and safe-field extraction, amount/currency verification, getTransactionStatus read-only behaviour, subscription and performance-fee checkout integration, provider routing (US/GB vs GH/NG/ZA), module wiring (real PaymentsModule graph compiles), audit log metadata, and build-artifact (dist) tracking convention. All 734 tests pass (44 suites), db:migrate has no pending migrations, api:build succeeds, no open handles. One minor non-security observation noted: performance-fee checkout metadata (shared PerformanceFeePaymentService code, pre-existing since Sprint 14) does not pass a `transactionId` key into provider metadata the way subscription checkout does — invoiceId/assessmentId already uniquely identify the transaction, so this is a debug-metadata completeness gap only, not a payment-state or security risk, and applies identically to Paystack (already audited/passed). No fix applied — out of the Sprint 17 Stripe-specific audit scope. Note: Sprint 18 clarified this issue. The provider-bound createCheckoutSession metadata already included transactionId; the missing part was the stored providerPayloadSummary, which Sprint 18 now populates with transactionId.

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

\- Sprint 17 audit: PASS, no fixes required — see Last verified status above for scope and detail

\- Sprint 18: Payment transaction reference uniqueness + metadata consistency hardening — HWM anti-regression (max() semantics), removed orphaned `markAssessmentPaid()`, performance-fee `providerPayloadSummary` now includes `transactionId`, `dist/` untracked from git, pre-migration duplicate-check runbook added. Migration `1751500000000` verified as pre-existing and correct. No new migrations, no new libraries, no Python changes. Sprint 18 merged to `main` and tagged `sprint-18-complete`.

\- Sprint 19 (in progress): Production deployment foundation — VPS/Webuzo deployment runbook, secrets policy runbook, PM2 ecosystem + systemd unit examples (no secrets), `.env.example` production notes, `.gitignore` hardened (`*.egg-info/`), `irexpro_ai_engine.egg-info/` untracked. Documentation + infrastructure only — no production logic, migrations, or payment/risk/execution/AI changes. 739 NestJS tests still passing across 44 suites.



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

