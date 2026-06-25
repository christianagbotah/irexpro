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
