# 19 — Future Wallet Model B

## iRexPro — Internal Wallet Architecture (Phase 2 Design)

---

## 1. Purpose

This document defines the architecture for iRexPro's future Model B — the internal wallet, custody, and settlement layer. Model B is **fully designed but not implemented in Phase 1**. This document serves as the specification for Phase 2 development when the business is ready to expand into fund custody.

---

## 2. Model B Overview

Model B introduces iRexPro as a **fund-custodying platform**:

- iRexPro holds user trading funds internally
- Users deposit funds into an iRexPro-managed Funding Wallet
- Funds are allocated to a Trading Wallet for AI trading
- Withdrawals and payouts are processed by iRexPro
- Profit sharing is settled directly from the Trading Wallet to the platform owner's account
- Crypto trading is supported via additional exchange adapters

**Model B requires separate legal and regulatory clearance before implementation.**

---

## 3. Wallet Architecture

### 3.1 Wallet Types per User

| Wallet | Purpose |
|---|---|
| **Funding Wallet** | Receives deposits; holds uncommitted funds |
| **Trading Wallet** | Allocated for active AI trading |
| **Earnings Wallet** | Realised profit held after performance fee deduction (future) |

### 3.2 Wallet Schema

```sql
CREATE TABLE wallet.wallets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES identity.users(id),
  wallet_type       VARCHAR(20) NOT NULL CHECK (wallet_type IN ('FUNDING','TRADING','EARNINGS')),
  currency          CHAR(3) NOT NULL,
  available_balance DECIMAL(18,8) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  locked_balance    DECIMAL(18,8) NOT NULL DEFAULT 0 CHECK (locked_balance >= 0),
  total_deposited   DECIMAL(18,8) NOT NULL DEFAULT 0,
  total_withdrawn   DECIMAL(18,8) NOT NULL DEFAULT 0,
  status            VARCHAR(15) NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE','FROZEN','CLOSED')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, wallet_type, currency)
);
```

---

## 4. Double-Entry Ledger

All wallet movements are recorded as immutable double-entry ledger entries. No balance is modified without a corresponding ledger entry pair.

### 4.1 Ledger Entry Schema

```sql
CREATE TABLE wallet.ledger_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id       UUID NOT NULL REFERENCES wallet.wallets(id),
  entry_type      VARCHAR(30) NOT NULL,  -- DEPOSIT, WITHDRAWAL, TRADE_ALLOCATION, PROFIT, FEE, etc.
  debit_amount    DECIMAL(18,8) NOT NULL DEFAULT 0,
  credit_amount   DECIMAL(18,8) NOT NULL DEFAULT 0,
  balance_after   DECIMAL(18,8) NOT NULL,  -- Snapshot of balance after this entry
  reference_id    UUID,                    -- FK to deposit, withdrawal, trade, fee record
  reference_type  VARCHAR(50),             -- Describes the referenced entity
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NO UPDATE OR DELETE permitted
);

REVOKE UPDATE, DELETE ON wallet.ledger_entries FROM irexpro_app;
```

### 4.2 Double-Entry Example: Deposit

```
User deposits $500 via Paystack

Ledger Entry 1 (debit):
  wallet: PAYMENT_LIABILITY_WALLET
  debit_amount: 500.00
  entry_type: DEPOSIT_RECEIVED

Ledger Entry 2 (credit):
  wallet: USER_FUNDING_WALLET (user_id = X)
  credit_amount: 500.00
  entry_type: DEPOSIT_CREDIT
  balance_after: 500.00
```

This ensures the total of all debit entries always equals the total of all credit entries across the platform.

---

## 5. Deposit Flow

```
User initiates deposit
  → System generates payment intent (Paystack / Stripe / Flutterwave)
  → User completes payment on provider UI
  → Payment provider sends webhook to iRexPro
  → iRexPro validates webhook signature
  → Create DepositRecord (status: CONFIRMED)
  → Create double-entry ledger entries
  → Credit user Funding Wallet
  → Notify user
  → Audit log entry

Note: Deposit amount is NEVER added to performance_account.total_realised_pnl
      Deposits are tracked separately in wallet.wallets.total_deposited
```

---

## 6. Withdrawal Flow

```
User requests withdrawal
  → Validate: available_balance >= requested_amount
  → Validate: no active open trades that could affect balance (optional lock)
  → Create WithdrawalRequest (status: PENDING)
  → Admin review (manual) or automatic approval (if within auto-approval threshold)
  → On approval:
    - Lock funds: move available_balance → locked_balance
    - Initiate payout via payment provider
    - On payout success: reduce locked_balance, create ledger debit entry
    - Update WithdrawalRequest status: COMPLETED
  → On failure: release locked_balance → available_balance
  → Audit log entry at every status change
```

---

## 7. Performance Fee Settlement (Model B)

In Model B, performance fees are settled directly from the user's Trading Wallet to the Platform Owner's Revenue Wallet:

```
Settlement cycle:
  1. Calculate fee_amount (same HWM logic as Model A)
  2. Verify fee_amount <= trading_wallet.available_balance
  3. Create ledger debit entry: USER TRADING WALLET
  4. Create ledger credit entry: PLATFORM OWNER REVENUE WALLET
  5. Update PerformanceAccount.highWaterMark
  6. Create FeeRecord
  7. Generate FeeStatement
  8. Audit log
```

---

## 8. Payment Provider Integrations (Model B — Global Routing)

Model B uses the same `IPaymentProvider` interface defined in [21-payment-provider-architecture.md](./21-payment-provider-architecture.md). Provider selection is driven by `CountryConfig.preferredPaymentProvider`. The wallet system routes deposits and payouts through the appropriate regional provider automatically.

### Deposit Providers by Region

| Provider | ID | Channels | Primary Region |
|---|---|---|---|
| **Stripe** | `stripe` | Card, bank transfer, SEPA | Global (US, UK, EU, AU) |
| **PayPal** | `paypal` | Card, PayPal balance | Global |
| **Paystack** | `paystack` | Card, bank, USSD, mobile money | NG, GH, KE, ZA |
| **Flutterwave** | `flutterwave` | Card, bank, mobile money | Pan-Africa (30+ countries) |
| **Hubtel** | `hubtel` | Card, mobile money, bank | Ghana primarily |
| **MTN Mobile Money** | `mtn_momo` | Mobile money | GH, NG, RW, CM, CI |
| **M-Pesa** | `mpesa` | Mobile money | KE, TZ, UG |
| **Wise** | `wise` | Bank transfer | Global (payouts) |

### Payout/Withdrawal Routing

```
User requests withdrawal
  → PaymentProviderRouter.selectPayoutProvider(user.country, currency)
    → GH: Hubtel (mobile money) / Paystack (bank)
    → NG: Paystack (bank) / Flutterwave
    → KE: M-Pesa / Flutterwave
    → GB/EU/US: Stripe / Wise (bank transfer)
    → Others: Stripe / Wise
  → Provider executes bank/mobile money payout
  → Ledger debit entry recorded
  → User notified via SMS + email
```

All providers implement the `IPaymentProvider` interface defined in Phase 1. Only the concrete implementations differ.

---

## 9. Crypto Trading Support (Model B)

Model B adds support for cryptocurrency trading via exchange adapters:

```typescript
interface ICryptoExchangeAdapter extends IBrokerAdapter {
  readonly supportsSpot: boolean;
  readonly supportsFutures: boolean;
  getWalletBalances(): Promise<CryptoWalletBalance[]>;
  deposit(amount: string, currency: string): Promise<DepositAddress>;
  withdraw(address: string, amount: string, currency: string): Promise<WithdrawalResult>;
}
```

Initial target exchange: Binance (via Binance Spot API)

---

## 10. Model B Regulatory Prerequisites (Global)

Model B introduces fund custody, which is subject to significantly more complex regulation in every market. Requirements vary by country — this table is indicative:

| Jurisdiction | Fund Custody Requirement | Payment Services | AML/KYC |
|---|---|---|---|
| Ghana | Bank of Ghana approval | PSP licence | AMLA compliance |
| Nigeria | CBN approval | PSP/MFB licence | AMLA, NDPR |
| Kenya | CBK authorisation | PSP licence | AML Act |
| South Africa | FSCA / Reserve Bank | PASA participation | FICA |
| United Kingdom | FCA (EMI or PI licence) | FCA authorisation | AML regulations |
| United States | State-by-state MSB + FinCEN | Money transmitter licences | BSA/AML |
| European Union | EMI licence (Central Bank of home state) | PSD2 | AMLD6 |
| Australia | ASIC + AUSTRAC | AFSL / payment facility | AML/CTF Act |

**Global Rule:** No Model B wallet features are activated in any country without explicit regulatory legal clearance for that jurisdiction. This is a hard prerequisite — not optional.

Additional Model B prerequisites (apply to all markets):

| Requirement | Status |
|---|---|
| Full KYC/AML programme built and tested | Required |
| VASP registration (crypto assets) | Required if crypto is enabled |
| Data protection impact assessment (DPIA) | Required for expanded data processing |
| Legal review of wallet ToS per market | Required before each market launch |
| Segregated client funds arrangement | Required for fund custody |
| PCI-DSS compliance (if card processing) | Required for card deposits |

---

## 11. Model A → Model B Migration Path

When Model B is ready for activation:

```
Phase 1 (Model A users):
  - Existing broker connections remain unchanged
  - Users offered optional Model B onboarding (wallet creation)
  - Model A and Model B can coexist during transition

Phase 2 (Model B activation):
  - New user onboarding defaults to Model B
  - Model A users can migrate by depositing into iRexPro wallet
  - Broker connections in Model B: iRexPro manages a master broker account
    and allocates sub-accounts per user (or continues user-connected model)

Data migration:
  - No historical trade data migration required
  - PerformanceAccount HWM carries forward
  - New wallets created fresh (no historical balance import)
```
