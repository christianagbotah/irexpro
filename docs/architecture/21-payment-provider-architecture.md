# 21 — Payment Provider Architecture

## iRexPro — Global Payment Provider Interface and Multi-Provider Strategy

---

## 1. Purpose

This document defines the payment provider architecture for iRexPro — a provider-agnostic, globally extensible payment layer that supports subscription billing, recurring renewals, invoice generation, failed payment handling, and regional provider routing. The system must never be hard-coded to a single payment provider.

---

## 2. Core Design Principle

iRexPro uses a **pluggable payment provider architecture**. Every payment provider is an interchangeable implementation of a common interface. Country and currency configuration drives which provider is selected for a given user. Adding a new provider requires only a new adapter class — no changes to business logic.

```
User Initiates Payment
  → PaymentProviderRouter
    → Selects provider based on: user.country + plan.currency + provider availability
    → Calls IPaymentProvider implementation
      → [Stripe | Paystack | Flutterwave | Hubtel | PayPal | Wise | ...]
    → Returns standardised PaymentResult
  → SubscriptionModule processes result
  → AuditModule logs payment event
```

---

## 3. IPaymentProvider Interface

Every payment provider must implement this TypeScript interface:

```typescript
interface IPaymentProvider {
  readonly providerId: string;       // e.g., "stripe", "paystack", "hubtel"
  readonly providerName: string;     // e.g., "Stripe", "Paystack", "Hubtel"
  readonly supportedCountries: string[];   // ISO 3166-1 alpha-2 country codes
  readonly supportedCurrencies: string[];  // ISO 4217 currency codes
  readonly supportsRecurring: boolean;
  readonly supportsWebhooks: boolean;

  // Subscription management
  createSubscription(params: CreateSubscriptionParams): Promise<ProviderSubscriptionResult>;
  cancelSubscription(externalSubscriptionId: string): Promise<void>;
  pauseSubscription(externalSubscriptionId: string): Promise<void>;
  resumeSubscription(externalSubscriptionId: string): Promise<void>;

  // One-time payment (for manual/one-off charges)
  createPaymentIntent(params: CreatePaymentIntentParams): Promise<ProviderPaymentIntentResult>;
  confirmPayment(externalPaymentId: string): Promise<ProviderPaymentResult>;

  // Webhook handling
  validateWebhookSignature(rawBody: Buffer, headers: Record<string, string>): boolean;
  parseWebhookEvent(rawBody: Buffer, headers: Record<string, string>): ParsedPaymentEvent;

  // Customer management
  createCustomer(params: CreateCustomerParams): Promise<ProviderCustomerResult>;
  getCustomer(externalCustomerId: string): Promise<ProviderCustomerResult>;

  // Refunds
  refundPayment(externalPaymentId: string, amountCents?: number): Promise<ProviderRefundResult>;
}
```

---

## 4. Core Data Types

```typescript
interface CreateSubscriptionParams {
  externalCustomerId: string;
  planId: string;               // Provider-side plan/price ID
  currency: string;             // ISO 4217
  trialDays?: number;
  metadata?: Record<string, string>;  // iRexPro userId, subscriptionId, etc.
}

interface ProviderSubscriptionResult {
  success: boolean;
  externalSubscriptionId: string;
  externalCustomerId: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';
  currentPeriodEnd: Date;
  currency: string;
  amountCents: number;
  error?: string;
}

interface ParsedPaymentEvent {
  eventType: PaymentEventType;
  externalSubscriptionId?: string;
  externalPaymentId?: string;
  externalCustomerId?: string;
  amountCents?: number;
  currency?: string;
  failureReason?: string;
  metadata?: Record<string, string>;
  rawEvent: unknown;
}

enum PaymentEventType {
  SUBSCRIPTION_CREATED = 'SUBSCRIPTION_CREATED',
  SUBSCRIPTION_UPDATED = 'SUBSCRIPTION_UPDATED',
  SUBSCRIPTION_CANCELLED = 'SUBSCRIPTION_CANCELLED',
  SUBSCRIPTION_PAST_DUE = 'SUBSCRIPTION_PAST_DUE',
  SUBSCRIPTION_RENEWED = 'SUBSCRIPTION_RENEWED',
  PAYMENT_SUCCEEDED = 'PAYMENT_SUCCEEDED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_REFUNDED = 'PAYMENT_REFUNDED',
  INVOICE_CREATED = 'INVOICE_CREATED',
  INVOICE_PAID = 'INVOICE_PAID',
  INVOICE_PAYMENT_FAILED = 'INVOICE_PAYMENT_FAILED',
}
```

---

## 5. Payment Provider Registry

```typescript
class PaymentProviderRegistry {
  private providers: Map<string, IPaymentProvider> = new Map();

  register(provider: IPaymentProvider): void {
    this.providers.set(provider.providerId, provider);
  }

  getProvider(providerId: string): IPaymentProvider {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Payment provider '${providerId}' not registered`);
    return provider;
  }

  getProvidersForCountry(countryCode: string): IPaymentProvider[] {
    return Array.from(this.providers.values())
      .filter(p => p.supportedCountries.includes(countryCode) || p.supportedCountries.includes('*'));
  }

  getSupportedProviders(): ProviderSummary[] {
    return Array.from(this.providers.values()).map(p => ({
      id: p.providerId,
      name: p.providerName,
      countries: p.supportedCountries,
      currencies: p.supportedCurrencies,
    }));
  }
}
```

---

## 6. Payment Provider Router

The router selects the appropriate provider for a given user and plan:

```typescript
class PaymentProviderRouter {
  selectProvider(
    userCountry: string,
    currency: string,
    preferredProvider?: string,
  ): IPaymentProvider {
    // 1. If user has a preferred provider set, use it (if available in their country)
    if (preferredProvider) {
      const preferred = this.registry.getProvider(preferredProvider);
      if (preferred.supportedCountries.includes(userCountry) &&
          preferred.supportedCurrencies.includes(currency)) {
        return preferred;
      }
    }

    // 2. Look up country configuration for recommended provider
    const countryConfig = this.countryConfigService.getConfig(userCountry);
    if (countryConfig?.preferredPaymentProvider) {
      return this.registry.getProvider(countryConfig.preferredPaymentProvider);
    }

    // 3. Fall back to first available provider that supports country + currency
    const available = this.registry.getProvidersForCountry(userCountry)
      .filter(p => p.supportedCurrencies.includes(currency));
    if (available.length === 0) {
      throw new UnsupportedRegionException(userCountry, currency);
    }
    return available[0];
  }
}
```

---

## 7. Supported Payment Providers

### 7.1 Global Providers

| Provider | ID | Recurring | Currencies | Notes |
|---|---|---|---|---|
| **Stripe** | `stripe` | Yes | 130+ | Primary global provider; best developer API |
| **PayPal / Braintree** | `paypal` | Yes | 25+ | Wide global consumer recognition |
| **Wise** | `wise` | No | 40+ | Payout-focused; international bank transfers |
| **Adyen** | `adyen` (future) | Yes | 150+ | Enterprise-grade; Phase 3+ |
| **Checkout.com** | `checkout` (future) | Yes | 150+ | High-volume; Phase 3+ |

### 7.2 Africa / Ghana Providers

| Provider | ID | Recurring | Countries | Notes |
|---|---|---|---|---|
| **Hubtel** | `hubtel` | Yes | GH | Ghana-first; card, mobile money, bank |
| **Paystack** | `paystack` | Yes | NG, GH, KE, ZA | Pan-African leader; excellent API |
| **Flutterwave** | `flutterwave` | Yes | 30+ African countries | Pan-African; card, mobile money, bank |
| **MTN Mobile Money** | `mtn_momo` (future) | No | GH, NG, RW, CM, CI | Direct MoMo integration |
| **M-Pesa** | `mpesa` (future) | No | KE, TZ, UG | East Africa mobile money |

### 7.3 Provider Capability Matrix

| Capability | Stripe | Paystack | Flutterwave | Hubtel |
|---|---|---|---|---|
| Card payments | ✅ | ✅ | ✅ | ✅ |
| Mobile money | ❌ | ✅ (GH, KE) | ✅ | ✅ (GH) |
| Bank transfer | ✅ | ✅ | ✅ | ✅ |
| Recurring subscriptions | ✅ | ✅ | ✅ | ✅ |
| Multi-currency | ✅ | Limited | ✅ | GHS primarily |
| Webhook support | ✅ | ✅ | ✅ | ✅ |
| Refunds | ✅ | ✅ | ✅ | ✅ |
| Sandbox/test mode | ✅ | ✅ | ✅ | ✅ |

---

## 8. Subscription Payment Flows

### 8.1 New Subscription

```
1. User selects plan
2. PaymentProviderRouter.selectProvider(user.country, plan.currency)
3. IPaymentProvider.createCustomer() → externalCustomerId
4. Store externalCustomerId in user's PaymentProfile
5. IPaymentProvider.createSubscription() → externalSubscriptionId
6. Store Subscription with status: PENDING, externalSubscriptionId
7. Provider redirects to payment UI or processes card-on-file
8. Provider sends webhook → POST /webhooks/{providerId}
9. PaymentWebhookService.process():
   a. Validate signature
   b. Parse event
   c. If PAYMENT_SUCCEEDED: activate Subscription
   d. Create Invoice record
   e. Emit SubscriptionActivated event
   f. Audit log
```

### 8.2 Recurring Renewal

```
Provider triggers renewal at end of billing cycle
→ Provider charges stored payment method
→ Provider sends SUBSCRIPTION_RENEWED or INVOICE_PAID webhook
→ PaymentWebhookService:
   - Extends Subscription.expiresAt
   - Creates new Invoice record
   - Sends renewal confirmation to user
   - Audit log
```

### 8.3 Failed Payment Handling

```
Provider charges fail (insufficient funds, expired card, etc.)
→ Provider sends PAYMENT_FAILED webhook
→ PaymentWebhookService:
   1. Set Subscription.status: PAST_DUE
   2. Create Invoice with status: FAILED
   3. Send failed payment alert (email + SMS)
   4. Start grace period timer (configurable: 7 days default)
   5. Schedule payment retry reminders

During grace period:
   - Day 1: Email + SMS alert
   - Day 3: Email reminder
   - Day 5: Final warning email + SMS
   - Day 7: Set Subscription.status: SUSPENDED
   - Suspend active TradingSession

On payment recovery:
   - Provider sends PAYMENT_SUCCEEDED webhook
   - Restore Subscription.status: ACTIVE
   - Resume TradingSession if suspended
   - Audit log
```

### 8.4 Payment Retry

```
PaymentRetryJob (BullMQ scheduled, configurable per provider):
  For each PAST_DUE subscription within grace period:
    1. Fetch provider and externalSubscriptionId
    2. Call provider's retry mechanism (provider-specific API)
    3. Log retry attempt
    4. Respect provider's own retry schedule where it applies
```

---

## 9. Invoice and Receipt Generation

Every successful payment generates an Invoice record:

```typescript
interface Invoice {
  id: string;           // UUID
  subscriptionId: string;
  userId: string;
  planName: string;
  amountCents: number;
  currency: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'VOID';
  paymentProvider: string;
  externalInvoiceId: string;     // Provider-side invoice/charge ID
  externalPaymentId: string;     // Provider-side payment/transaction reference
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  paidAt: Date | null;
  taxAmountCents: number;        // 0 if not applicable
  taxRate: number;               // e.g., 0.125 = 12.5% VAT/GST
  taxDescription: string | null; // e.g., "VAT (UK)", "GST (AU)"
  issuedAt: Date;
  receiptUrl: string | null;     // Provider-hosted receipt URL
  downloadUrl: string | null;    // iRexPro PDF receipt URL (future)
}
```

---

## 10. Multi-Currency Support

### 10.1 Plan Pricing in Multiple Currencies

Each SubscriptionPlan can have pricing in multiple currencies:

```sql
CREATE TABLE subscriptions.plan_pricing (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       UUID NOT NULL REFERENCES subscriptions.subscription_plans(id),
  currency      CHAR(3) NOT NULL,
  amount_cents  INTEGER NOT NULL,
  provider_plan_id VARCHAR(255),   -- Provider-side plan/price ID for this currency
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (plan_id, currency)
);
```

### 10.2 Currency Selection

When a user subscribes:
1. System checks user's country → looks up `CountryConfig.defaultCurrency`
2. Checks if plan has pricing in that currency
3. If yes: charge in local currency
4. If no: charge in USD (default fallback)
5. User may override currency preference in profile settings

### 10.3 Tax/VAT Readiness

```sql
CREATE TABLE subscriptions.tax_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code  CHAR(2) NOT NULL UNIQUE,
  tax_type      VARCHAR(10) NOT NULL,    -- "VAT", "GST", "SALES_TAX"
  tax_rate      DECIMAL(5,4) NOT NULL,   -- e.g., 0.20 = 20%
  description   VARCHAR(50) NOT NULL,   -- e.g., "VAT (UK 20%)"
  applies_to    VARCHAR(20) NOT NULL DEFAULT 'SUBSCRIPTION',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);
```

---

## 11. Payment Audit Log Events

All payment events produce immutable audit log entries:

| Event | Trigger |
|---|---|
| `PAYMENT_PROVIDER_SELECTED` | Provider selection at subscription initiation |
| `PAYMENT_CUSTOMER_CREATED` | Provider-side customer created |
| `PAYMENT_SUBSCRIPTION_CREATED` | Provider-side subscription created |
| `PAYMENT_SUCCEEDED` | Webhook: payment successful |
| `PAYMENT_FAILED` | Webhook: payment failed |
| `PAYMENT_RETRIED` | Automatic payment retry attempted |
| `PAYMENT_REFUNDED` | Refund initiated and confirmed |
| `SUBSCRIPTION_PAST_DUE` | Grace period started |
| `SUBSCRIPTION_SUSPENDED_PAYMENT_FAILURE` | Grace period expired without payment |
| `INVOICE_CREATED` | Invoice record created |
| `INVOICE_PAID` | Invoice marked paid |
| `WEBHOOK_RECEIVED` | Raw webhook received (for all providers) |
| `WEBHOOK_INVALID_SIGNATURE` | Webhook signature validation failed |

---

## 12. Webhook Endpoint Design

Each provider has a dedicated webhook endpoint to allow provider-specific signature validation:

```
POST /api/v1/webhooks/stripe          → Stripe-Signature header
POST /api/v1/webhooks/paystack        → x-paystack-signature header
POST /api/v1/webhooks/flutterwave     → verif-hash header
POST /api/v1/webhooks/hubtel          → Hubtel-specific validation
POST /api/v1/webhooks/paypal          → PayPal webhook validation
```

All webhook endpoints:
- Accept raw body (not parsed JSON) for signature validation
- Validate signature before any processing
- Respond HTTP 200 immediately, process asynchronously via BullMQ queue
- Are idempotent (duplicate webhook events with same provider event ID are ignored)

---

## 13. Manual/Admin Payment Provider

For Phase 1 pilots and admin-managed subscriptions:

```typescript
class ManualPaymentProvider implements IPaymentProvider {
  readonly providerId = 'manual';
  readonly providerName = 'Manual (Admin)';
  readonly supportedCountries = ['*'];  // All countries
  readonly supportedCurrencies = ['*'];
  readonly supportsRecurring = false;
  readonly supportsWebhooks = false;

  // Admin creates subscription directly via admin dashboard
  // No actual payment processing — used for pilots, comps, and trials
}
```

---

---

## 15. Sprint 10 Implementation Status (2026-06-26)

### What is implemented

| Component | Status |
|---|---|
| `IPaymentProvider` interface | ✅ Hardened — `createCheckoutSession`, `verifyWebhookSignature`, `getTransactionStatus`, `refundPayment` |
| `BasePaymentProvider` | ✅ Fail-closed — all live methods throw `NotImplementedException`, `verifyWebhookSignature` returns `false` |
| `ManualPaymentProvider` | ✅ DEV/TEST only — full interface, all methods warn |
| Stripe, Flutterwave, Hubtel, PayPal, Wise | ✅ Safe sandbox placeholders — fail closed |
| Paystack | ✅ **Sandbox-live since Sprint 15** — see §16 below; fails closed when disabled/unconfigured |
| `PaymentRoutingService` | ✅ Country/currency routing via `CountryConfig`, excludes `manual` |
| `PaymentTransaction` entity | ✅ `payments.payment_transactions` — bigint minor units |
| `Invoice` entity | ✅ `payments.invoices` — bigint minor units |
| `PaymentWebhookEvent` entity | ✅ `payments.payment_webhook_events` — idempotency store |
| `WebhookProcessorService` | ✅ Signature verification → idempotency → state change → audit |
| `POST /subscriptions/checkout` | ✅ Creates invoice + transaction, returns session reference |
| `POST /subscriptions/cancel` | ✅ Cancels subscription with audit log |
| `POST /payments/webhooks/:provider` | ✅ Raw body capture, signature verify, idempotent processing |
| `GET /payments/providers` | ✅ Public provider list — no secrets |
| Audit actions | ✅ 9 new actions added |
| Migration | ✅ `CreatePaymentsSchema1750900000000` |

### What is NOT yet implemented (future sprints)

- Live HTTP integration for any provider (Stripe SDK, Paystack API, etc.)
- Real webhook signature verification (requires live provider credentials)
- Subscription renewal scheduling
- Refund management UI
- Invoice PDF generation

---

## 15. Performance Fee Invoice Payment Flow (Sprint 14)

`PerformanceFeePaymentService` (in the payments module) lets an authenticated user
— or an admin on their behalf — pay an existing **performance-fee** invoice through
the same `PaymentRoutingService` used for subscriptions. It assigns a routed provider
to the pending transaction created at invoicing time and returns a checkout session.

### Endpoints (all require JWT; ownership enforced)

| Endpoint | Access |
|---|---|
| `GET /api/v1/performance-fees/invoices` | User: own only. Admin: any (via `userId`). |
| `GET /api/v1/performance-fees/invoices/:invoiceId` | User: own only. Admin: any. |
| `POST /api/v1/performance-fees/invoices/:invoiceId/checkout` | User: own only. Admin: any. |
| `GET /api/v1/performance-fees/invoices/:invoiceId/payment-status` | User: own only. Admin: any. |

### Checkout flow

1. Load invoice; enforce ownership (non-admin cross-user → `403`).
2. Require `invoice.metadata.type === 'PERFORMANCE_FEE'`.
3. Require invoice status `ISSUED` or `OVERDUE` (reject `PAID`/`VOID`/`CANCELLED`/`DRAFT`).
4. Require a linked assessment in status `INVOICED`.
5. Reuse the **existing** `PERFORMANCE_FEE` `PaymentTransaction` (created at invoicing) —
   never create a duplicate payable transaction.
   - `SUCCEEDED` → reject (already paid).
   - `PROCESSING` on a real (non-`manual`) provider with a reference → return the
     existing session (idempotent; no duplicate provider charge).
   - `PENDING`/`manual` default → assign the routed provider.
6. Route via `PaymentRoutingService.routeForCheckout()` (excludes `manual`, fails
   closed on unsupported country/currency/provider).
7. Call `provider.createCheckoutSession()`. On failure: transaction stays `PENDING`,
   invoice stays unpaid, assessment stays `INVOICED`; emit `PERFORMANCE_FEE_CHECKOUT_FAILED`.
8. On success: update transaction → `PROCESSING` with provider + reference + safe
   `providerPayloadSummary`; emit `PERFORMANCE_FEE_CHECKOUT_INITIATED`.

### Safety invariants

- **Checkout never marks paid.** It never sets the invoice `PAID`, never sets the
  assessment `PAID`, never creates a `FEE_PAID` ledger entry, and never updates the
  high-water mark. The service has no dependency on the performance/ledger repos.
- **Verified webhook is the only paid/HWM path.** Frontend success is never trusted.
- **Manual provider is dev/test only** and can never be selected for public checkout.
- **No duplicate transactions/invoices** — the pending transaction is reused.
- **Fail closed** — unconfigured provider placeholders throw `NotImplementedException`,
  surfaced as a sanitised `400`; the invoice remains payable for retry.
- **No secrets** in responses, `providerPayloadSummary`, or audit metadata.

### Deferred (future sprints)

- Live provider SDK/API calls and real signature verification (credentials required).
- Admin/dev manual settlement endpoint — intentionally **not** implemented in Sprint 14
  to avoid any path that could bypass the webhook-only paid/HWM invariant.

### Sprint 14 payment/security audit — fixes applied

1. **Module wiring: `PaymentsModule` ↔ `SubscriptionsModule` circular dependency.**
   `WebhookProcessorService` (in `PaymentsModule`) injects `SubscriptionsService`
   (in `SubscriptionsModule`), while `SubscriptionsService` injects
   `PaymentRoutingService` (in `PaymentsModule`) — a genuine bidirectional module
   dependency. Without `forwardRef()` on **both** `@Module({ imports: [...] })`
   declarations, Nest could not resolve `WebhookProcessorService`'s dependencies
   at bootstrap (`Nest can't resolve dependencies of the WebhookProcessorService
   ... SubscriptionsService at index [1] is available in the PaymentsModule
   context`), which would have crashed the app on startup. Fixed with
   `forwardRef(() => SubscriptionsModule)` / `forwardRef(() => PaymentsModule)` on
   both module imports, plus `@Inject(forwardRef(() => SubscriptionsService))` on
   the `WebhookProcessorService` constructor parameter. Verified with a new
   `payments.module.spec.ts` integration-style test that boots the real module
   graph (repositories stubbed, no live DB) and resolves `WebhookProcessorService`
   and `SubscriptionsService` end-to-end; reproduced the original failure by
   temporarily reverting the fix to confirm the test fails without it.
2. **Concurrent-checkout race in provider assignment.** Two simultaneous checkout
   requests for the same invoice could both pass the "reuse existing session"
   check while the transaction was still `PENDING`/`manual`, both call
   `provider.createCheckoutSession()`, and race to overwrite
   `providerTransactionReference` — silently orphaning whichever provider session
   lost the race (a customer paying that session would never be matched by the
   webhook, since the DB would hold the other session's reference). Fixed by
   atomically claiming the transaction (`PENDING`/`FAILED` → `PROCESSING`, gated
   on an `UPDATE ... WHERE status IN (...)` affected-row check) before calling any
   provider. A lost claim safely returns the winner's session (if it has one
   already) or a `409 Conflict` asking the caller to retry shortly — it never
   calls the provider a second time. Provider/validation failures release the
   claim back to `PENDING` so the invoice remains retryable.

---

## 16. Paystack Sandbox Integration (Sprint 15)

`PaystackPaymentProvider` is upgraded from a fail-closed placeholder to a real
**sandbox** implementation of `IPaymentProvider`, used identically by both the
subscription checkout flow (§8) and the performance-fee invoice checkout flow (§15) —
neither service required any change, since both depend only on the generic interface.
No Paystack SDK is used; a small injectable `PaystackHttpClient` wraps native `fetch`.

### Configuration (fail-closed by default)

| Variable | Default | Notes |
|---|---|---|
| `PAYSTACK_ENABLED` | `false` | Master switch; provider is never "live" unless `true` |
| `PAYSTACK_SECRET_KEY` | unset | Server-side only; never logged/returned/thrown |
| `PAYSTACK_PUBLIC_KEY` | unset | Not currently exposed by any endpoint |
| `PAYSTACK_WEBHOOK_SECRET` | unset | Falls back to `PAYSTACK_SECRET_KEY` for signature verification if unset, per Paystack's own model |
| `PAYSTACK_BASE_URL` | `https://api.paystack.co` | Overridable for testing |
| `PAYSTACK_CALLBACK_URL` | unset | Passed to Paystack as the post-checkout redirect; never trusted for state changes |

`isLive` is `true` only when `PAYSTACK_ENABLED === 'true'` **and** a secret key is
configured; otherwise the provider behaves like every other fail-closed placeholder.

### `createCheckoutSession` — Transaction Initialize

Calls Paystack's `POST /transaction/initialize` with amount in minor units (kobo/pesewas),
currency, customer email, a generated stable reference (`psk_<uuid>`), and a whitelisted
`metadata` object (`invoiceId`, `userId`, `planId`, `paymentPurpose`,
`internalTransactionId`, `subscriptionId` — no secrets, no free-form data). Returns the
Paystack `authorization_url` and `reference`; never marks anything paid.

### `verifyWebhookSignature` — HMAC-SHA512 over the raw body

Reads the `x-paystack-signature` header, computes `HMAC-SHA512(rawBody, secretKey)` and
compares it to the header using `crypto.timingSafeEqual` (never `===`). Fails closed
(returns `false`, never throws) when the header, secret, or raw body is missing, or on
any crypto/parsing error. This check runs before any state change in
`WebhookProcessorService`, identical to every other provider (§12).

### `parseWebhookEvent` — safe mapping, no raw payload persistence

| Paystack event | Internal `PaymentEventType` |
|---|---|
| `charge.success` | `PAYMENT_SUCCEEDED` |
| `charge.failed` | `PAYMENT_FAILED` |
| `invoice.payment_failed` | `PAYMENT_FAILED` |
| `subscription.disable` | `SUBSCRIPTION_CANCELLED` |

A stable `providerEventId` is derived from the event type + transaction reference (Paystack
does not send a dedicated event ID) and is the idempotency key `WebhookProcessorService`
uses to guarantee a duplicate webhook is never double-processed. Only whitelisted metadata
fields are extracted and stored — the raw webhook body is never persisted.

### `getTransactionStatus` — Transaction Verify (read-only)

Calls `GET /transaction/verify/:reference` for server-side status confirmation only. This
is **never** a substitute for webhook signature verification and never itself marks
anything paid — it exists purely as an optional status-check convenience.

### Safety invariants (identical to every other provider)

- Checkout (`createCheckoutSession`) never marks an invoice, subscription, or
  performance-fee assessment paid, and never updates the high-water mark.
- The verified `charge.success` webhook is the **only** path to subscription activation
  or performance-fee paid/HWM state — frontend callbacks and `PAYSTACK_CALLBACK_URL`
  redirects are never trusted.
- `PAYSTACK_SECRET_KEY` / `PAYSTACK_WEBHOOK_SECRET` are never logged, returned in an API
  response, or included in a thrown error message; `PaystackHttpClient` never logs the
  `Authorization` header.
- No raw card data or mobile money PINs are read, stored, or forwarded.
- `manual` remains excluded from `PaymentRoutingService.routeForCheckout()` and blocked
  at the public webhook endpoint — unaffected by this sprint.
- All tests mock `PaystackHttpClient`/`fetch`; no live Paystack network calls are made.

---

## 14. Failure Cases

| Failure | Response |
|---|---|
| Provider API unavailable | Retry with backoff; surface "payment processing delayed" to user |
| Webhook signature invalid | Log WEBHOOK_INVALID_SIGNATURE; reject with HTTP 401; alert admin |
| Unsupported country/currency | Surface graceful error; suggest alternative payment method |
| Duplicate webhook event | Idempotency check on provider event ID; return 200 without re-processing |
| Provider returns error on subscription create | Surface provider error (sanitised); do not activate subscription |
| Grace period expires | Suspend subscription and active trading session |
| Refund request after HWM fee collected | Admin review process; manual ledger adjustment with audit log |
