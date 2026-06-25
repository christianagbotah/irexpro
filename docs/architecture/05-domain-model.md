# 05 — Domain Model

## iRexPro — Core Domain Entities and Relationships

---

## 1. Purpose

This document defines the core domain model for iRexPro: the key entities, their attributes, relationships, and business rules. This model drives database schema design, API contracts, and service layer logic.

---

## 2. Domain Entity Map

```
Platform Configuration
  └── CountryConfig ──► (drives payment, SMS, broker, KYC, currency routing)

User ──────────────────────────────────────────────────────────┐
  │                                                             │
  ├── UserProfile (country, currency, timezone, language)       │
  ├── UserPaymentProfile ──► (per-provider customer reference)  │
  ├── UserDisclosure (risk, terms — immutable)                  │
  ├── BrokerConnection ──► BrokerAccount                       │
  ├── Subscription ──► SubscriptionPlan ──► PlanPricing        │
  │         └── Invoice (with tax, provider reference)         │
  ├── TradingSession                                            │
  │         └── Trade ──► Signal (AI provenance)               │
  ├── PerformanceAccount ──► HighWaterMark                     │
  ├── FeeRecord ──► OwnerRevenueAccount                        │
  ├── RiskProfile                                              │
  ├── NotificationPreferences                                  │
  └── AuditLog                                                 │
                                                               │
Signal ──────────────────────────────────────────────────────── │
  └── RiskValidationResult (Risk Engine decision)              │
                                                               │
GlobalKillSwitch ────────────────────────────────────────────── ┘
```

---

## 3. Core Entities

### 3.1 User

The primary account entity for platform participants.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `email` | string | Unique, verified |
| `passwordHash` | string | bcrypt, never returned in responses |
| `status` | enum | PENDING_VERIFICATION, ACTIVE, SUSPENDED, CLOSED |
| `role` | enum | USER, ADMIN, SUPER_ADMIN |
| `mfaEnabled` | boolean | |
| `mfaSecret` | string (encrypted) | TOTP secret |
| `emailVerifiedAt` | timestamp | Null until verified |
| `riskDisclosureAcceptedAt` | timestamp | Mandatory |
| `termsAcceptedAt` | timestamp | Mandatory |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**Business Rules**
- Email must be verified before any trading access
- Risk disclosure acceptance timestamp is immutable
- Suspended users cannot activate AI trading

---

### 3.2 UserProfile

Extended profile information.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `userId` | UUID | FK → User |
| `firstName` | string | |
| `lastName` | string | |
| `country` | string | ISO 3166-1 alpha-2 |
| `phoneNumber` | string | |
| `tradingExperience` | enum | NONE, BEGINNER, INTERMEDIATE, EXPERIENCED |
| `preferredCurrency` | string | ISO 4217 |
| `onboardingCompletedAt` | timestamp | |

---

### 3.3 BrokerConnection

Represents a user's linked broker account.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `userId` | UUID | FK → User |
| `brokerId` | string | e.g., "MT5", "OANDA" — references BrokerRegistry |
| `accountId` | string | Broker-assigned account number |
| `accountType` | enum | DEMO, LIVE |
| `status` | enum | CONNECTED, DISCONNECTED, SUSPENDED, REVOKED |
| `encryptedCredentials` | encrypted JSON | AES-256 envelope encryption |
| `credentialKeyId` | string | KMS key reference |
| `lastHealthCheckAt` | timestamp | |
| `lastSyncedAt` | timestamp | |
| `connectedAt` | timestamp | |
| `disconnectedAt` | timestamp | Null if currently connected |

**Business Rules**
- `encryptedCredentials` must never appear in API responses
- Status changes must create AuditLog entries
- LIVE connection only allowed after DEMO connection validated

---

### 3.4 BrokerAccount (Synced State)

A snapshot of the broker account's financial state, synced periodically.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `brokerConnectionId` | UUID | FK |
| `balance` | decimal(18,8) | Account balance in base currency |
| `equity` | decimal(18,8) | Balance + floating P&L |
| `margin` | decimal(18,8) | Used margin |
| `freeMargin` | decimal(18,8) | Available margin |
| `marginLevel` | decimal(10,4) | Margin level % |
| `currency` | string | Account currency |
| `leverage` | integer | Account leverage ratio |
| `syncedAt` | timestamp | |

---

### 3.5 SubscriptionPlan

Platform-defined subscription tiers.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `name` | string | e.g., "Starter", "Pro", "Elite" |
| `description` | text | |
| `priceCents` | integer | Price in smallest currency unit |
| `currency` | string | ISO 4217 |
| `billingCycle` | enum | MONTHLY, QUARTERLY, ANNUAL |
| `trialDays` | integer | 0 = no trial |
| `performanceFeeRate` | decimal(5,4) | e.g., 0.20 = 20% |
| `maxConcurrentTrades` | integer | |
| `features` | JSON | Plan feature flags |
| `isActive` | boolean | |
| `createdAt` | timestamp | |

---

### 3.6 Subscription

A user's active or historical subscription.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `userId` | UUID | FK → User |
| `planId` | UUID | FK → SubscriptionPlan |
| `status` | enum | TRIAL, ACTIVE, EXPIRED, CANCELLED, SUSPENDED |
| `startedAt` | timestamp | |
| `expiresAt` | timestamp | |
| `trialEndsAt` | timestamp | Null if not on trial |
| `autoRenew` | boolean | |
| `paymentProvider` | string | e.g., "stripe", "paystack" |
| `externalSubscriptionId` | string | Provider-side subscription ID |
| `cancelledAt` | timestamp | |
| `cancellationReason` | string | |

**Business Rules**
- AI Auto Trading requires `status = ACTIVE` or `status = TRIAL` (if within trial window)
- Expiry check must be server-side, not client-side
- Cancellation reason is logged for churn analysis

---

### 3.7 Invoice

A record of each billing event.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `subscriptionId` | UUID | FK |
| `userId` | UUID | FK |
| `amountCents` | integer | |
| `currency` | string | |
| `status` | enum | PENDING, PAID, FAILED, REFUNDED |
| `provider` | string | |
| `externalInvoiceId` | string | |
| `paidAt` | timestamp | |
| `issuedAt` | timestamp | |

---

### 3.8 TradingSession

Represents one active AI trading engagement period.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `userId` | UUID | FK → User |
| `brokerConnectionId` | UUID | FK |
| `subscriptionId` | UUID | FK |
| `status` | enum | ACTIVE, PAUSED, STOPPED, SUSPENDED_BROKER_FAILURE, SUSPENDED_KILL_SWITCH, SUSPENDED_RISK_LIMIT |
| `riskProfileSnapshot` | JSON | Risk settings at session start (immutable reference) |
| `startedAt` | timestamp | |
| `stoppedAt` | timestamp | |
| `pausedAt` | timestamp | |
| `stopReason` | string | |

**Business Rules**
- Only one ACTIVE session per user at a time
- Session must reference a valid active subscription and connected broker

---

### 3.9 Trade

A single trade executed by the Execution Engine.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Internal trade ID |
| `tradingSessionId` | UUID | FK |
| `userId` | UUID | FK (denormalised for query performance) |
| `brokerConnectionId` | UUID | FK |
| `externalOrderId` | string | Broker-assigned order ID |
| `idempotencyKey` | string | Unique key per order submission |
| `instrument` | string | e.g., "EURUSD" |
| `direction` | enum | BUY, SELL |
| `status` | enum | PENDING, OPEN, CLOSED, CANCELLED, REJECTED |
| `lotSize` | decimal(10,4) | |
| `entryPrice` | decimal(18,8) | |
| `exitPrice` | decimal(18,8) | Null until closed |
| `stopLoss` | decimal(18,8) | |
| `takeProfit` | decimal(18,8) | |
| `trailingStopPips` | decimal(10,2) | Null if not set |
| `openedAt` | timestamp | |
| `closedAt` | timestamp | |
| `realisedPnl` | decimal(18,8) | Null until closed |
| `commission` | decimal(18,8) | |
| `swap` | decimal(18,8) | |
| `signalId` | UUID | FK → Signal that triggered this trade |
| `signalConfidence` | decimal(5,4) | Captured at time of signal |
| `rejectionReason` | string | If status = REJECTED |

**Business Rules**
- `realisedPnl` populated only on close — never from floating P&L
- Idempotency key prevents duplicate order submission
- Signal reference provides full audit trail

---

### 3.10 Signal

The output of the AI Signal Engine, representing a trading recommendation.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `engineVersion` | string | Model version that generated this signal |
| `instrument` | string | |
| `timeframe` | string | e.g., "M15", "H1" |
| `direction` | enum | BUY, SELL, HOLD, CLOSE, MODIFY |
| `confidence` | decimal(5,4) | 0.0 to 1.0 |
| `entryPrice` | decimal(18,8) | Suggested entry |
| `suggestedSL` | decimal(18,8) | Suggested stop-loss |
| `suggestedTP` | decimal(18,8) | Suggested take-profit |
| `volatilityScore` | decimal(5,4) | |
| `trendScore` | decimal(5,4) | |
| `regimeDetected` | string | e.g., "TRENDING_UP", "RANGING" |
| `indicators` | JSON | Raw indicator values at signal time |
| `generatedAt` | timestamp | |
| `expiresAt` | timestamp | Signal validity window |

---

### 3.11 RiskProfile

Per-user configurable risk parameters.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `userId` | UUID | FK |
| `maxDailyLossPercent` | decimal(5,2) | e.g., 5.00 = 5% |
| `maxDrawdownPercent` | decimal(5,2) | |
| `maxPositionSizeLots` | decimal(10,4) | |
| `maxConcurrentTrades` | integer | |
| `maxDailyTrades` | integer | |
| `riskLevel` | enum | CONSERVATIVE, MODERATE, AGGRESSIVE |
| `tradingHoursStart` | time | Optional session hours |
| `tradingHoursEnd` | time | |
| `allowedInstruments` | string[] | Whitelist of instruments |
| `updatedAt` | timestamp | |

---

### 3.12 PerformanceAccount

Tracks cumulative performance for fee calculation.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `userId` | UUID | FK, unique |
| `totalRealisedPnl` | decimal(18,8) | Cumulative realised P&L |
| `highWaterMark` | decimal(18,8) | Peak equity for fee purposes |
| `lastSettledAt` | timestamp | |
| `currency` | string | |

---

### 3.13 FeeRecord

Records each performance fee charge.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `userId` | UUID | FK |
| `settlementPeriodStart` | timestamp | |
| `settlementPeriodEnd` | timestamp | |
| `realisedPnlInPeriod` | decimal(18,8) | |
| `pnlAboveHwm` | decimal(18,8) | Portion above high-water mark |
| `feeRate` | decimal(5,4) | Rate applied |
| `feeAmount` | decimal(18,8) | Calculated fee |
| `currency` | string | |
| `calculatedAt` | timestamp | |
| `status` | enum | CALCULATED, POSTED, DISPUTED |

---

### 3.14 AuditLog

Immutable system event record.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `eventType` | string | e.g., "USER_REGISTERED", "TRADE_OPENED" |
| `actorId` | UUID | User or system process |
| `actorType` | enum | USER, ADMIN, SYSTEM |
| `entityType` | string | e.g., "Trade", "Subscription" |
| `entityId` | UUID | |
| `payload` | JSON | Event snapshot |
| `ipAddress` | string | |
| `userAgent` | string | |
| `createdAt` | timestamp | Indexed, never updatable |

**Business Rules**
- No UPDATE or DELETE operations on AuditLog table
- Insert-only access via AuditService
- Retained for minimum 7 years (configurable for compliance)

---

### 3.15 GlobalKillSwitch

System-wide trading halt control.

| Field | Type | Notes |
|---|---|---|
| `id` | integer | Singleton row (id=1) |
| `isActive` | boolean | If true, all trading suspended |
| `activatedBy` | UUID | Admin who activated |
| `activatedAt` | timestamp | |
| `reason` | text | |
| `deactivatedAt` | timestamp | |

---

### 3.16 CountryConfig

Platform-level regional configuration. Drives payment provider, SMS provider, broker availability, KYC requirements, currency, and compliance rules per country. This is a **platform configuration entity** — not per-user. It is managed by SuperAdmin and cached in Redis.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `countryCode` | char(2) | ISO 3166-1 alpha-2 (unique) |
| `countryName` | string | |
| `region` | string | e.g., "West Africa", "Europe" |
| `isSupported` | boolean | Whether the country is open for registration |
| `isBlocked` | boolean | Sanctioned or regulatory-blocked |
| `defaultCurrency` | char(3) | ISO 4217 |
| `supportedCurrencies` | string[] | |
| `preferredPaymentProvider` | string | Provider ID from PaymentProviderRegistry |
| `fallbackPaymentProviders` | string[] | Ordered fallback list |
| `supportedPaymentMethods` | string[] | e.g., ["card","mobile_money","bank_transfer"] |
| `preferredSmsProvider` | string | Provider ID from SmsProviderRegistry |
| `fallbackSmsProviders` | string[] | |
| `supportedBrokerIds` | string[] | Brokers available in this country |
| `kycRequired` | boolean | |
| `kycLevel` | enum | NONE, BASIC, STANDARD, ENHANCED |
| `kycDocumentTypes` | string[] | e.g., ["NATIONAL_ID","PASSPORT"] |
| `amlScreeningRequired` | boolean | |
| `vatApplicable` | boolean | |
| `vatRate` | decimal(5,4) | e.g., 0.20 |
| `vatDescription` | string | e.g., "VAT (UK 20%)" |
| `primaryLanguage` | string | BCP 47 language tag |
| `defaultTimezone` | string | IANA timezone |
| `forexTradingAllowed` | boolean | |
| `specialDisclosureRequired` | boolean | |
| `specialDisclosureText` | text | Country-specific risk/regulatory text |
| `regulatoryNotes` | text | Internal compliance notes |

**Business Rules**
- `isBlocked = true` prevents registration, login, and trading for users from that country
- Changes to CountryConfig are audit-logged with before/after values
- CountryConfig is cached in Redis (5-minute TTL) for performance
- New countries are activated via `isSupported = true` — no code deploy required

---

### 3.17 UserPaymentProfile

Stores the user's payment provider customer references. One record per provider the user has engaged with.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `userId` | UUID | FK → User |
| `paymentProvider` | string | Provider ID e.g., "stripe", "hubtel" |
| `externalCustomerId` | string | Provider-side customer reference |
| `preferredCurrency` | char(3) | |
| `defaultPaymentMethod` | string | Provider-side payment method token (no raw card data) |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**Business Rules**
- Raw card numbers, CVVs, or bank account numbers are never stored here
- `defaultPaymentMethod` stores only a provider-issued opaque token
- Unique per (userId, paymentProvider) pair

---

### 3.18 PlanPricing

Multi-currency pricing for a subscription plan. Allows the same plan to be priced in GHS, NGN, GBP, USD, EUR, etc.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `planId` | UUID | FK → SubscriptionPlan |
| `currency` | char(3) | ISO 4217 |
| `amountCents` | integer | Price in smallest currency unit |
| `providerPlanId` | string | Provider-side price/plan ID for this currency |
| `isActive` | boolean | |

**Business Rules**
- Unique per (planId, currency) pair
- When a user subscribes, their currency is resolved from `CountryConfig.defaultCurrency` then `UserProfile.preferredCurrency`
- If no pricing exists for the user's currency, USD pricing is used as fallback
