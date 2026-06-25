# 18 — Compliance and Risk Disclosures

## iRexPro — Regulatory Compliance, Legal Posture, and Risk Disclosure Requirements

---

## 1. Purpose

This document defines the compliance framework, legal risk posture, mandatory risk disclosures, and regulatory considerations that must be embedded into iRexPro's design, user experience, and operational procedures.

---

## 2. Critical Compliance Principles

The following principles are non-negotiable and must be reflected throughout the platform:

1. **iRexPro does not guarantee trading profits.** Forex trading involves substantial risk of loss.
2. **The AI trading system is a tool, not a financial advisor.** It does not constitute personalised investment advice.
3. **Past performance does not guarantee future results.** Historical backtesting and paper trading results are not predictive.
4. **Users are responsible for their own trading decisions.** By activating AI Auto Trading Mode, users authorise the system to trade on their behalf within the parameters they set.
5. **Risk disclosure must be obtained and recorded before any trading activity.**
6. **iRexPro operates in the Model A structure — user funds remain with their own regulated broker.** iRexPro does not hold or custody user funds in Phase 1.

---

## 3. Risk Disclosure Requirements

### 3.1 Mandatory User Acknowledgements

The following disclosures must be accepted by each user with timestamp and IP address recorded in the database and audit log before access to any trading features:

**Disclosure 1: General Trading Risk**
> "Forex trading involves a high level of risk and may not be suitable for all investors. The high degree of leverage can work against you as well as for you. Before deciding to trade foreign exchange, you should carefully consider your investment objectives, level of experience, and risk appetite. You could sustain a loss of some or all of your initial investment and should not invest money that you cannot afford to lose."

**Disclosure 2: AI Trading Limitation**
> "iRexPro's AI trading system is an automated trading tool. It does not constitute investment advice, and no guarantee of profit is made or implied. The AI system operates based on historical data, technical analysis, and statistical models. Past performance does not guarantee future results. Market conditions can change rapidly, and the AI system may produce losing trades."

**Disclosure 3: Autonomous Trading Authorisation**
> "By activating AI Auto Trading Mode, you authorise iRexPro to place, modify, and close trades on your connected broker account on your behalf. You understand and accept that trading decisions are made autonomously by the AI system and that you bear the financial consequences of all trades executed."

**Disclosure 4: No Custody of Funds**
> "iRexPro does not hold, custody, or transfer your trading funds. Your funds remain in your account at your regulated broker at all times. iRexPro connects to your broker account via authorised API access to execute trades on your behalf."

### 3.2 Where Disclosures Are Presented

| Disclosure | Trigger Point |
|---|---|
| General Trading Risk | Registration / onboarding wizard |
| AI Trading Limitation | First AI Auto Trading activation |
| Autonomous Trading Authorisation | Every AI Auto Trading activation (re-confirmation) |
| Platform Terms of Service | Registration |
| Privacy Policy | Registration |

### 3.3 Disclosure Record Schema

```sql
CREATE TABLE identity.user_disclosures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES identity.users(id),
  disclosure_type VARCHAR(50) NOT NULL,
  version         VARCHAR(20) NOT NULL,  -- Document version: "v1.0", "v1.1"
  accepted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address      INET NOT NULL,
  user_agent      TEXT,
  platform        VARCHAR(20) NOT NULL CHECK (platform IN ('WEB','ANDROID','IOS'))
);
```

Disclosure records are immutable and retained for the lifetime of the account plus 7 years.

---

## 4. Financial Regulatory Considerations

### 4.1 Business Model Regulatory Position (Model A)

iRexPro Phase 1 does not:
- Hold or custody client funds
- Act as a broker or market maker
- Provide personalised investment advice
- Execute transactions on a proprietary trading book

iRexPro Phase 1 operates as a software service that connects to a user's own regulated broker account via API. This positions iRexPro as a **software/SaaS provider** rather than a regulated financial entity in many jurisdictions.

> **Important:** Legal and regulatory requirements vary significantly by jurisdiction. Before launching in any market, obtain appropriate legal advice regarding licensing requirements (e.g., FCA, SEC, FSCA, MAS, CMA, etc.). This document does not constitute legal advice.

### 4.2 Global Regulatory Scope

iRexPro is designed as a **global platform**. Every market activation requires jurisdiction-specific legal review. The table below is not exhaustive — it covers primary launch markets:

| Jurisdiction | Regulator(s) | Key Considerations |
|---|---|---|
| Ghana | SEC Ghana, Bank of Ghana | Investment services licence; payment services authorisation |
| Nigeria | SEC Nigeria, CBN, NITDA | Forex automation review; NDPR data protection compliance |
| Kenya | CMA Kenya, CBK | Capital markets licensing; payment services |
| South Africa | FSCA, SARB | FSCA FSP licence may be required; POPIA data compliance |
| United Kingdom | FCA | Automated trading tools may require FCA authorisation; GDPR |
| United States | CFTC, NFA, SEC | Most complex jurisdiction; likely requires NFA/CFTC registration for Forex; do not launch without dedicated US legal counsel |
| European Union | ESMA + national regulators | MiFID II; GDPR; DORA for operational resilience |
| Australia | ASIC | AFSL required for financial services; automated trading may be regulated |
| Singapore | MAS | Capital markets services licence |
| UAE | DFSA / ADGM / SCA | Depends on emirate; DIFC/ADGM have their own frameworks |
| Canada | Provincial regulators | IIROC/CIRO; regulations vary by province |
| Other markets | Local regulator | Review required before any market activation |

**Rule:** No new market is activated (`CountryConfig.isSupported = true`) without explicit legal sign-off for that jurisdiction documented in the compliance log.

### 4.3 KYC/AML Readiness

While Phase 1 does not require full KYC (user funds are at the broker, who performs their own KYC), the platform is KYC-ready and country-configured:

- User profile schema includes fields for ID document readiness
- `CountryConfig.kycLevel` drives what verification is required per market (`NONE`, `BASIC`, `STANDARD`, `ENHANCED`)
- `CountryConfig.kycDocumentTypes` specifies accepted documents per country
- `CountryConfig.amlScreeningRequired` flags markets requiring AML screening
- Blocked country list managed in `CountryConfig.isBlocked` — updated whenever sanctions lists change
- Future KYC document upload module is architecturally planned (Phase 2 for Model B markets)

---

## 5. Terms of Service Requirements

The iRexPro Terms of Service must explicitly state:

1. Nature of service (SaaS automation tool, not a broker or investment advisor)
2. Risk disclaimers (Forex trading risk, no guaranteed profit)
3. AI trading limitations (automated, no human oversight per trade)
4. User responsibility for trading losses
5. Subscription fee structure and non-refundability terms
6. Performance fee calculation methodology
7. Broker connection requirements and data access scope
8. Platform downtime and technical failure disclaimer
9. Jurisdiction restrictions (list of blocked countries)
10. Account suspension and termination grounds
11. Data retention and privacy policy reference
12. Dispute resolution procedures

---

## 6. Platform Prohibited Representations

The following representations are **strictly prohibited** across all platform surfaces (website, app, marketing materials, emails, notifications):

| Prohibited | Compliant Alternative |
|---|---|
| "Guaranteed profits" | "AI-driven trading signals — results vary based on market conditions" |
| "Earn X% per month" | "Historical backtest performance is not indicative of future results" |
| "Risk-free trading" | "Forex trading involves risk of loss" |
| "Never lose money" | "Our AI includes risk management features designed to manage, not eliminate, losses" |
| "Beat the market" | "AI-assisted market analysis" |
| "Passive income" | "Automated trading — past performance does not guarantee future results" |

Marketing and content teams must be briefed on these restrictions. All marketing copy must be reviewed against this list before publication.

---

## 7. Data Privacy Compliance

### 7.1 GDPR (European Users)

| Requirement | Implementation |
|---|---|
| Lawful basis for processing | Contract performance + legitimate interest |
| Data minimisation | Only necessary user data collected |
| Right to access | User can request all personal data export |
| Right to erasure | Soft-delete on user account; anonymisation of records where legally required to retain |
| Data breach notification | 72-hour notification to supervisory authority |
| Privacy by design | Implemented throughout architecture |

### 7.2 Data Retention Policy

| Data Type | Retention Period |
|---|---|
| Trade records | 7 years (financial record requirement) |
| Audit logs | 7 years |
| Subscription and invoice records | 7 years |
| Payment provider transaction records | 7 years |
| SMS delivery log | 90 days (no message body stored) |
| User personal data | Account lifetime + 2 years post-closure |
| Session and access logs | 90 days |
| Marketing communications | Until consent withdrawn |

### 7.3 Cross-Border Data Transfers

For users in GDPR-regulated regions, personal data transfers outside the EU/EEA require a lawful transfer mechanism:
- **Standard Contractual Clauses (SCCs):** in place with cloud providers (AWS, etc.)
- **Data Processing Agreements (DPAs):** executed with all third-party providers (payment, SMS, analytics)
- **Data residency:** EU data stored in EU-region AWS where technically feasible

For Nigeria (NDPR): certain personal data of Nigerian citizens must be processed in Nigeria or with Nigerian regulatory approval. Legal review required before NG market activation.

---

## 8. System Behaviour Guardrails (Technical Compliance Controls)

These controls are implemented in code to ensure regulatory compliance:

| Control | Implementation |
|---|---|
| Risk disclosure before trading | Onboarding gate — cannot activate AI trading until disclosure accepted |
| Subscription before trading | SubscriptionGate in TradingSessionService |
| Broker validation before trading | BrokerConnectionGate in TradingSessionService |
| No trades without stop-loss | Risk Engine mandatory SL check |
| No guaranteed profit language in notifications | Content review + system-generated message standards |
| Audit log immutability | REVOKE UPDATE/DELETE on audit table + append-only service |
| Credential security | Encryption + never-expose controls in DTO layer |

---

## 9. Incident and Complaint Handling

A formal incident and complaint procedure must be in place before launch:

1. **User complaints:** Support ticketing system with SLA (response within 48 hours)
2. **Trading disputes:** Dedicated trading dispute workflow with audit log evidence retrieval
3. **Financial disputes:** Escalation path to senior management + external arbitration if unresolved
4. **Regulatory inquiries:** Legal team notified immediately; audit logs preserved and made available
5. **Data breach:** Incident response plan per security architecture document

---

## 10. Future Regulatory Preparation (Model B)

When Model B (internal wallet and custody) is implemented, the regulatory landscape changes significantly:

- Fund custody may require e-money institution (EMI) licence or equivalent
- AML/KYC obligations become platform-level (not delegated to broker)
- Payment services licensing required for deposit/withdrawal flows
- Full PCI-DSS compliance if card payments processed
- VASP registration required if crypto assets are supported

Model B must not be launched without obtaining appropriate legal and regulatory clearance in target markets.
