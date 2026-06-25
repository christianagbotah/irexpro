# 23 — Country and Regional Configuration

## iRexPro — Global-First Regional Configuration Architecture

---

## 1. Purpose

This document defines the country and regional configuration architecture for iRexPro. The platform is **global-first** — it must support users from any eligible country with appropriate provider routing, currency handling, compliance requirements, KYC rules, and localisation. No country-specific logic is hardcoded; all regional behaviour is driven by the `CountryConfig` data model.

---

## 2. Design Principle

> iRexPro is a global platform. Regional providers (Hubtel, Arkesel, etc.) are important for specific markets but are plug-in components of a globally extensible architecture. The platform's core logic is country-agnostic. Regional differences are configuration, not code.

---

## 3. CountryConfig Data Model

```sql
CREATE TABLE platform.country_configs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  country_code                CHAR(2) NOT NULL UNIQUE,   -- ISO 3166-1 alpha-2
  country_name                VARCHAR(100) NOT NULL,
  region                      VARCHAR(50) NOT NULL,       -- e.g., "West Africa", "Europe", "Southeast Asia"
  is_supported                BOOLEAN NOT NULL DEFAULT FALSE,
  is_blocked                  BOOLEAN NOT NULL DEFAULT FALSE,   -- Sanctioned/prohibited countries

  -- Currency
  default_currency            CHAR(3) NOT NULL,          -- ISO 4217
  supported_currencies        CHAR(3)[] NOT NULL DEFAULT '{}',

  -- Payment routing
  preferred_payment_provider  VARCHAR(30),               -- FK to registered provider ID
  fallback_payment_providers  VARCHAR(30)[] DEFAULT '{}',
  supported_payment_methods   VARCHAR(30)[] DEFAULT '{}', -- e.g., ["card", "mobile_money", "bank_transfer"]

  -- SMS routing
  preferred_sms_provider      VARCHAR(30),
  fallback_sms_providers      VARCHAR(30)[] DEFAULT '{}',

  -- Broker availability
  supported_broker_ids        VARCHAR(50)[] DEFAULT '{}',

  -- Compliance and KYC
  kyc_required                BOOLEAN NOT NULL DEFAULT FALSE,
  kyc_level                   VARCHAR(20) DEFAULT 'NONE'
                                CHECK (kyc_level IN ('NONE','BASIC','STANDARD','ENHANCED')),
  kyc_document_types          VARCHAR(50)[] DEFAULT '{}',  -- e.g., ["NATIONAL_ID","PASSPORT"]
  aml_screening_required      BOOLEAN NOT NULL DEFAULT FALSE,
  requires_proof_of_address   BOOLEAN NOT NULL DEFAULT FALSE,
  sanctions_check_required    BOOLEAN NOT NULL DEFAULT FALSE,
  regulatory_notes            TEXT,

  -- Tax/VAT
  vat_applicable              BOOLEAN NOT NULL DEFAULT FALSE,
  vat_rate                    DECIMAL(5,4),              -- e.g., 0.125 = 12.5%
  vat_description             VARCHAR(50),               -- e.g., "VAT (UK 20%)"
  tax_id_label                VARCHAR(50),               -- e.g., "VAT Number", "TIN", "GST Number"

  -- Localisation
  primary_language            CHAR(5) NOT NULL DEFAULT 'en',  -- BCP 47 tag
  supported_languages         CHAR(5)[] DEFAULT '{en}',
  default_timezone            VARCHAR(50) NOT NULL DEFAULT 'UTC',
  date_format                 VARCHAR(20) DEFAULT 'DD/MM/YYYY',
  number_format_locale        VARCHAR(10) DEFAULT 'en-US',

  -- Trading restrictions
  forex_trading_allowed       BOOLEAN NOT NULL DEFAULT TRUE,
  min_account_age_days        INTEGER DEFAULT 0,
  special_disclosure_required BOOLEAN NOT NULL DEFAULT FALSE,
  special_disclosure_text     TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_country_configs_code ON platform.country_configs(country_code);
CREATE INDEX idx_country_configs_region ON platform.country_configs(region);
CREATE INDEX idx_country_configs_supported ON platform.country_configs(is_supported);
```

---

## 4. Initial Country Configuration (Seed Data)

### Phase 1 Launch Countries

| Country | Code | Currency | Payment Provider | SMS Provider | KYC Level | Notes |
|---|---|---|---|---|---|---|
| Ghana | GH | GHS | Hubtel / Paystack | Hubtel → Arkesel | BASIC | Strong Forex retail market |
| Nigeria | NG | NGN | Paystack | Arkesel → Twilio | BASIC | Largest Forex retail market in Africa |
| Kenya | KE | KES | Flutterwave | Arkesel → Twilio | BASIC | Growing Forex market |
| South Africa | ZA | ZAR | Flutterwave | Twilio | STANDARD | Regulated by FSCA |
| United Kingdom | GB | GBP | Stripe | Twilio | STANDARD | FCA regulated market |
| United States | US | USD | Stripe | Twilio | ENHANCED | CFTC/NFA considerations |
| Canada | CA | CAD | Stripe | Twilio | STANDARD | |
| Australia | AU | AUD | Stripe | Twilio | STANDARD | ASIC regulated |
| Singapore | SG | SGD | Stripe | Twilio | STANDARD | MAS regulated |
| United Arab Emirates | AE | AED | Stripe | Twilio | STANDARD | |

### Blocked Countries (Sanctions / Regulatory)

Countries under OFAC/UN sanctions or where Forex retail services are prohibited are listed in `country_configs` with `is_blocked = TRUE`. This list must be reviewed and updated whenever sanctions change.

Initial blocked countries follow OFAC SDN list and FATF high-risk jurisdictions. Full list managed by compliance team.

---

## 5. CountryConfigService

```typescript
class CountryConfigService {
  async getConfig(countryCode: string): Promise<CountryConfig | null>;
  async isSupported(countryCode: string): Promise<boolean>;
  async isBlocked(countryCode: string): Promise<boolean>;
  async getPreferredPaymentProvider(countryCode: string): Promise<string>;
  async getPreferredSmsProvider(countryCode: string): Promise<string>;
  async getSupportedCurrencies(countryCode: string): Promise<string[]>;
  async getKycRequirements(countryCode: string): Promise<KycRequirements>;
  async getVatConfig(countryCode: string): Promise<VatConfig | null>;
  async getSupportedBrokers(countryCode: string): Promise<string[]>;
  async getAvailablePaymentMethods(countryCode: string): Promise<string[]>;
}
```

Country configs are cached in Redis with a configurable TTL (default: 5 minutes) to avoid repeated DB queries on every request.

```
Redis key: countryconfig:{countryCode}
TTL: 300 seconds (5 minutes)
Invalidation: On admin update to CountryConfig
```

---

## 6. Country Gate at Registration

During user registration, the system enforces country eligibility:

```typescript
async function validateCountryEligibility(countryCode: string): Promise<void> {
  const config = await countryConfigService.getConfig(countryCode);

  if (!config) {
    throw new UnsupportedCountryException(countryCode);
  }
  if (config.isBlocked) {
    throw new BlockedCountryException(countryCode);
  }
  if (!config.isSupported) {
    throw new UnsupportedCountryException(countryCode);
  }
  if (!config.forexTradingAllowed) {
    throw new ForexTradingNotPermittedException(countryCode);
  }
}
```

Country validation happens at:
1. User registration (hard block for blocked/unsupported countries)
2. Broker connection (check broker is available in user's country)
3. Payment initiation (check payment provider supports user's country)
4. Subscription activation (check country is eligible for trading)

---

## 7. Multi-Currency Architecture

### 7.1 System Currency Policy

- All internal financial calculations are performed in the **plan's billing currency** (stored in `plan_pricing.currency`)
- Platform owner revenue account maintains separate ledgers per currency
- Performance fees are calculated and recorded in the trade account's base currency
- Currency conversion is **not performed** by iRexPro in Phase 1 — users pay in their plan's currency
- In Phase 2 (Model B), currency conversion will be handled by a dedicated FX rate service

### 7.2 Currency Display

User-facing monetary values are displayed in:
1. The user's `preferred_currency` (from UserProfile)
2. Falling back to the user country's `default_currency`
3. Falling back to USD

Exchange rates for display purposes are fetched from a public FX rate API (e.g., Open Exchange Rates, Frankfurter) with caching. Displayed rates are for reference only — not used for billing calculations.

### 7.3 Supported Currencies (Initial)

| Currency | Code | Region |
|---|---|---|
| US Dollar | USD | Global default |
| British Pound | GBP | UK |
| Euro | EUR | EU |
| Ghanaian Cedi | GHS | Ghana |
| Nigerian Naira | NGN | Nigeria |
| Kenyan Shilling | KES | Kenya |
| South African Rand | ZAR | South Africa |
| Australian Dollar | AUD | Australia |
| Canadian Dollar | CAD | Canada |
| Singapore Dollar | SGD | Singapore |
| UAE Dirham | AED | UAE |

---

## 8. Timezone Handling

All timestamps are stored in UTC in the database. Localisation for display is performed at the API response or frontend layer:

- Database: always UTC (`TIMESTAMPTZ`)
- API responses: ISO 8601 with UTC (`2026-06-25T10:00:00.000Z`)
- Frontend display: converted to user's local timezone using `CountryConfig.defaultTimezone` or user-set timezone preference
- Scheduled jobs: run in UTC; results timestamped in UTC

Trading hour configurations in `RiskProfile` use the user's local timezone, stored as timezone-aware values.

---

## 9. Localisation Readiness

Phase 1 ships in English only. The architecture is localisation-ready:

```typescript
// Translation keys (i18n) used for all user-facing strings
// Example:
t('trading.riskAlert.dailyLossLimitReached', {
  limit: '5%',
  currency: 'USD',
})

// Translated to:
// en: "Daily loss limit of 5% reached. AI trading suspended for your safety."
// fr: "Limite de perte journalière de 5% atteinte. Trading AI suspendu pour votre sécurité."
```

- Next.js: `next-intl` for i18n routing and translations
- React Native: `i18n-js` or `react-i18next`
- Translation files stored in `packages/shared-translations/`
- Priority languages for Phase 2: French (West Africa — CI, SN, CM), Swahili (KE, TZ), Arabic (AE, SA)

---

## 10. KYC Requirements by Country

The `kyc_level` field drives what verification is required before trading:

| Level | Requirements | Countries (examples) |
|---|---|---|
| `NONE` | No KYC required by platform (broker handles their own KYC) | Most Phase 1 countries under Model A |
| `BASIC` | Name, country, phone number verification | GH, NG, KE (Phase 1 Model A) |
| `STANDARD` | ID document (passport or national ID) + selfie | ZA, GB, AU |
| `ENHANCED` | ID document + proof of address + source of funds | US, EU (depending on broker type) |

Under Model A, the broker performs their own KYC when the user opens a broker account. iRexPro's KYC requirements are minimal in Phase 1. This changes under Model B.

---

## 11. Broker Availability by Country

Not all brokers are available in all countries (regulatory restrictions, payment routing limitations). The `supported_broker_ids` field in `CountryConfig` defines which brokers are offered to users in each country:

```json
{
  "GH": { "supported_broker_ids": ["broker_a", "broker_b"] },
  "US": { "supported_broker_ids": ["broker_c"] },
  "GB": { "supported_broker_ids": ["broker_a", "broker_c", "broker_d"] }
}
```

When a user attempts to connect a broker:
1. System checks `CountryConfig.supportedBrokerIds` for user's country
2. If broker not in list: block connection with appropriate message
3. If list is empty: all registered brokers are allowed (permissive fallback)

---

## 12. Admin Management of Country Configuration

SuperAdmin has full control over country configuration through the admin dashboard:

```
Admin → Platform Settings → Country Configuration
  → View all countries with current config
  → Enable / disable countries
  → Block / unblock countries
  → Update payment provider routing
  → Update SMS provider routing
  → Update KYC requirements
  → Update broker availability
  → Update VAT/tax rules
  → Export country config (for compliance review)
```

All changes to CountryConfig produce an audit log entry with the before/after values.

---

## 13. Regional Compliance Notes by Region

| Region | Notes |
|---|---|
| **Africa (General)** | Forex retail commonly offered; regulatory oversight varies widely; many countries require local currency pricing |
| **Ghana (GH)** | Bank of Ghana oversees payment services; SEC Ghana for investment services |
| **Nigeria (NG)** | CBN regulates Forex; SEC Nigeria for investment; NITDA for data protection |
| **Kenya (KE)** | CMA Kenya for capital markets; CBK for payment services |
| **South Africa (ZA)** | FSCA for financial services; strong regulatory environment |
| **United Kingdom (GB)** | FCA — strict; automated trading services may require FCA authorisation |
| **United States (US)** | CFTC/NFA for Forex; potentially most complex jurisdiction; legal review essential |
| **European Union** | MiFID II governs automated trading tools; GDPR for data protection |
| **Australia (AU)** | ASIC for financial services; automated trading services regulated |
| **Southeast Asia** | MAS (SG), OJK (ID), SEC (TH) — varies by country |

All country-specific compliance requirements must be reviewed by legal counsel before market activation.
