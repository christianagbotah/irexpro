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

### Sprint 15 payment/security audit — fixes applied (2026-07-06)

1. **Missing amount/currency verification before marking a webhook payment paid.**
   `WebhookProcessorService.handlePaymentSucceeded()` located the `PaymentTransaction`
   solely by `providerTransactionReference` + `provider` and then marked it `SUCCEEDED`
   — without ever checking that the webhook-reported `amountMinor`/`currency` matched
   the transaction's expected values. A malformed/forged payload (or a provider-side
   data error) reporting success for the right reference but the wrong amount or
   currency (underpayment, overpayment, wrong currency) would have been accepted as a
   full payment, activating a subscription or crediting a performance fee that was
   never actually collected in full. Fixed by adding `amountAndCurrencyMatch()` —
   a BigInt/string-safe, case-insensitive comparison that runs before any state
   change and fails closed when either side's amount/currency is missing. A mismatch
   is audit-logged as `PAYMENT_FAILED` (`severity: CRITICAL`, `reason:
   'AMOUNT_OR_CURRENCY_MISMATCH'`) and leaves the transaction/invoice/
   subscription/assessment completely untouched. Applies identically to subscription
   and performance-fee transactions since both flow through the same handler.
2. **Ghana auto-routing could never actually reach Paystack.** `CountryConfig` lists
   `enabledPaymentProviders: ['hubtel', 'paystack', 'flutterwave', 'stripe', 'manual']`
   for Ghana, and `PaymentRoutingService.routeForCheckout()`'s auto-routing step picked
   the *first* listed provider that supported the country/currency — without regard to
   `isLive`. Since `hubtel` is a permanently non-implemented placeholder (fails closed
   with `NotImplementedException` on every checkout call), **every** Ghana checkout
   that didn't explicitly pass `provider: 'paystack'` would auto-route to `hubtel` and
   always fail, even with Paystack fully enabled and configured. Fixed by having the
   auto-routing step prefer a `isLive === true` candidate among all matching enabled
   providers regardless of list order, falling back to the first matching candidate
   (preserving prior placeholder-routing behaviour) only when no enabled provider is
   live. Nigeria was unaffected (`paystack` was already listed first there).

---

## 17. Subscription Checkout Idempotency + Pending Invoice Reuse (Sprint 16)

Prior to Sprint 16, `SubscriptionsService.initiateCheckout()` created a brand-new
`DRAFT` invoice + `PENDING` `PaymentTransaction` on **every** call, so a double-click
or two nearly-simultaneous checkout requests could leave multiple parallel pending
invoices/transactions for the same user/plan. This section documents the fix, which
applies identically to every payment provider (Stripe, Paystack, Flutterwave, Hubtel,
PayPal, Wise, and any future provider) since it lives entirely in the
provider-agnostic `SubscriptionsService`, not in any individual provider adapter.

### 17.1 Checkout identity

A checkout is considered "the same" when all of the following match:

```
(userId, planId, currency, countryCode, paymentPurpose)
```

`paymentPurpose` is `SUBSCRIPTION_INITIAL` for a user's first-ever subscription (or
one still in `TRIAL`, which has never been paid) and `SUBSCRIPTION_RENEWAL`
otherwise. These fields are stored on `Invoice.metadata` (`planId`, `countryCode`,
`paymentPurpose`, `type: 'SUBSCRIPTION'`) — no new columns were required.

### 17.2 Reuse decision table

| Existing state found for the identity | Behaviour |
|---|---|
| No matching invoice | Create a new `DRAFT` invoice + `PENDING` transaction (unchanged from before). |
| Invoice `PAID`, or its transaction `SUCCEEDED` | **Blocked** — `409 Conflict`, no invoice/transaction created. |
| Invoice `DRAFT`/`ISSUED`, transaction `PENDING`/`PROCESSING`, amount still matches current pricing | **Reused** — no new invoice/transaction. |
| ...and that transaction already has an active provider session (`PROCESSING` + `providerTransactionReference`) | **Provider session reused** — the existing `checkoutUrl`/`sessionId`/reference is returned; `provider.createCheckoutSession()` is never called again. |
| ...and that transaction is `PENDING`/`manual` with no session yet | **Assignable** — the routed provider is attached to the *existing* transaction (no new row). |
| Invoice `DRAFT`/`ISSUED`, transaction `FAILED`/`CANCELLED`/`REFUNDED` | The stale invoice is marked `CANCELLED` ("superseded") and a fresh invoice/transaction pair is created. Documented, not silently dropped. |
| Invoice `DRAFT`/`ISSUED`, amount no longer matches current plan pricing (price changed) | Never reused — a fresh invoice/transaction pair is created; the stale one is left untouched for manual review (rare edge case). |
| Requested provider differs from the existing transaction's provider **and** a real `providerTransactionReference` already exists | **Rejected** — `409 Conflict`; a real provider session is never silently abandoned. |
| Requested provider differs and no session reference exists yet | **Allowed** — the provider is switched on the existing transaction before calling it. |

An **ACTIVE**/**TRIAL** subscription that is still within its current period for the
*same plan* blocks checkout entirely (`409 Conflict`) before any invoice/transaction
lookup — there is nothing to check out for.

### 17.3 Concurrency / race safety

Two layers, matching the pattern already used by `PerformanceFeePaymentService`
(Sprint 14) plus one new DB-level guard:

1. **App-level reuse check** (read-then-decide) — closes the race in the common
   case (sequential double-clicks, retries after a failure).
2. **DB-level partial unique index** (`AddSubscriptionCheckoutDuplicateGuard`
   migration) — the authoritative guard for two truly concurrent requests that both
   pass the app-level check at the same time:

   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_unique_pending_subscription_checkout
     ON payments.invoices (
       user_id, currency, (metadata->>'planId'), (metadata->>'countryCode'), (metadata->>'paymentPurpose')
     )
     WHERE status IN ('DRAFT', 'ISSUED') AND (metadata->>'type') = 'SUBSCRIPTION'
   ```

   A losing `INSERT` raises Postgres `23505 unique_violation`, which
   `SubscriptionsService` catches and resolves by re-reading and reusing the
   winning invoice/transaction — never surfacing a raw DB error and never leaving
   an orphaned transaction.
3. **Atomic conditional claim before calling any provider** — `UPDATE
   payment_transactions SET status = 'PROCESSING' WHERE id = :id AND status IN
   ('PENDING', 'FAILED')`. This prevents two requests that both observed the same
   reusable `PENDING` transaction from both calling `provider.createCheckoutSession()`
   and racing to overwrite `providerTransactionReference`. A lost claim returns the
   winner's active session if one now exists, or a `409 Conflict` asking the caller
   to retry shortly — it never calls the provider a second time.

Provider call failures release the claim back to `PENDING` (not `FAILED`) so the
transaction — and therefore the invoice — remains retryable without spawning a new
invoice on the next attempt.

### 17.4 Optional Idempotency-Key support

Clients may optionally send an `Idempotency-Key` header (or `idempotencyKey` in the
`CheckoutDto` body). No schema change was required — the key is SHA-256 hashed
(never stored raw) alongside a SHA-256 fingerprint of the checkout parameters
(`userId`, `planId`, `currency`, `countryCode`, requested `provider`), both stored in
the existing `Invoice.metadata` JSONB column.

- Same key + same user + same parameters → returns the original invoice/transaction/
  session again, with no new provider call.
- Same key + different parameters → fails safely with `409 Conflict`.
- The key is entirely optional; omitting it uses parameter-based reuse only (§17.1–17.3).

### 17.5 Response shape

`POST /subscriptions/checkout` now always returns:

```typescript
interface CheckoutResult {
  invoiceId: string;
  transactionId: string;
  provider: string;
  providerTransactionReference?: string;
  checkoutUrl?: string;
  sessionId?: string;
  requiresRedirect: boolean;
  status: PaymentTransactionStatus;   // PENDING | PROCESSING | ...
  reused: boolean;
  reason: 'NEW_CHECKOUT' | 'REUSED_PENDING_CHECKOUT' | 'PROVIDER_SESSION_REUSED' | 'IDEMPOTENCY_KEY_REPLAY';
}
```

No provider secrets, raw provider payloads, or webhook data are ever included.

### 17.6 Audit actions (new)

| Action | When |
|---|---|
| `PAYMENT_CHECKOUT_REUSED` | A pending invoice/transaction is reused and a provider call is (re-)issued on it, or an Idempotency-Key replay is served. |
| `PAYMENT_CHECKOUT_PROVIDER_SESSION_REUSED` | An already-active provider session is returned with no new provider call. |

Existing `PAYMENT_CHECKOUT_INITIATED`/`PAYMENT_CHECKOUT_FAILED`/`INVOICE_CREATED`
actions are unchanged and still emitted for genuinely new invoices/sessions. All
metadata on every audit entry excludes provider secrets, authorization headers, raw
provider responses, card data, mobile money PINs, and tokens — unchanged invariant.

### 17.7 Sprint 16 audit fixes (2026-07-06)

A post-implementation audit found and fixed three issues before Sprint 17 began:

1. **Raw DB error leak on a narrow concurrency race** — `createInvoiceAndTransaction()`'s
   23505-unique-violation handler re-read the winning invoice via `findReusableCheckout()`
   and returned it, but only handled the `'reuse'` and `'blocked'` outcomes. Because the
   invoice and its transaction are two separate, non-atomic inserts, a very narrow timing
   window exists where the winner's invoice has committed but its transaction has not —
   `findReusableCheckout()` then classifies it as `'supersede'` (its "data inconsistency
   safety net"), which fell through to `throw err`, re-throwing the raw
   `QueryFailedError` to the API layer. Fixed: `'supersede'`/`'none'` outcomes after a
   23505 now throw a safe `ConflictException` ("please retry shortly") — the raw DB
   error is never surfaced to a caller.
2. **Idempotency fingerprint missing `paymentPurpose`/`amountMinor`** — the fingerprint
   originally hashed only `userId`, `planId`, `currency`, `countryCode`, and `provider`.
   A price change between the original request and a retry with the same idempotency
   key would have silently replayed the stale-priced session instead of being treated
   as "different parameters." Fixed: the fingerprint now also includes `paymentPurpose`
   and `amountMinor`, so a mid-flight price change correctly fails closed with `409
   Conflict` on replay instead of returning a stale-priced checkout.
3. **Empty `Idempotency-Key` header could shadow a valid body field** — the controller
   used `idempotencyKeyHeader ?? dto.idempotencyKey`, so an empty-string header (e.g.
   from a proxy that always sets the header) would win over a real body-supplied key.
   Fixed: the header is trimmed and only takes precedence when non-empty.

None of these fixes change any externally-observable behavior for the success paths
already covered by the Part I test suite — they only close narrow edge cases. New
regression tests were added for all three (`subscriptions.service.spec.ts`,
`subscriptions.controller.spec.ts`).

### 17.8 What is unchanged (webhook-only activation)

This sprint touches **only** checkout-time invoice/transaction creation. It does not
change:
- `WebhookProcessorService` — a verified webhook remains the only path that marks an
  invoice `PAID`, a transaction `SUCCEEDED`, or activates a subscription.
- Amount/currency mismatch handling, duplicate-webhook idempotency, or invalid-
  signature handling (Sprint 15 audit fixes) — all regression-tested, unchanged.
- Any individual provider adapter (Stripe/Paystack/Flutterwave/Hubtel/PayPal/Wise) —
  the fix lives entirely in `SubscriptionsService`, which depends only on the generic
  `IPaymentProvider` interface.

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
