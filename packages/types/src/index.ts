/**
 * @irexpro/types — shared frontend-safe TypeScript types.
 *
 * These types are intentionally a CLEAN, frontend-facing contract. They do NOT
 * import backend entities (TypeORM @Entity classes) or backend secrets, to
 * avoid leaking implementation details or pulling server-only code into the
 * client bundle. Backend and frontend types may diverge; this package is the
 * authoritative source for what the frontend may assume about API responses.
 *
 * All money values are integer minor-unit strings (e.g. "5000" = $50.00),
 * matching the backend's bigint-at-rest convention. The frontend must never
 * use floating-point for money at API boundaries.
 */

// ── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  roles: UserRole[];
  countryCode?: string | null;
}

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'USER';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  /** Refresh token is normally httpOnly cookie; this field may be empty on web. */
  refreshToken?: string;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
}

// ── Subscriptions / plans ───────────────────────────────────────────────────

export type BillingInterval = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

export interface SubscriptionPlan {
  id: string;
  name: string;
  billingInterval: BillingInterval;
  amountCents: string;
  currency: string;
  isActive: boolean;
}

export type SubscriptionStatus =
  | 'ACTIVE'
  | 'TRIAL'
  | 'PAST_DUE'
  | 'CANCELLED'
  | 'EXPIRED';

export interface UserSubscription {
  id: string;
  userId: string;
  planId: string;
  planName?: string;
  status: SubscriptionStatus;
  paymentProvider?: string | null;
  currentPeriodEnd: string;
  startedAt: string;
}

// ── Payments / invoices ─────────────────────────────────────────────────────

export type PaymentProvider =
  | 'stripe'
  | 'paystack'
  | 'flutterwave'
  | 'hubtel'
  | 'paypal'
  | 'wise'
  | 'manual';

export type PaymentPurpose =
  | 'SUBSCRIPTION_INITIAL'
  | 'SUBSCRIPTION_RENEWAL'
  | 'PERFORMANCE_FEE';

export type PaymentTransactionStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

export type InvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'OVERDUE'
  | 'PAID'
  | 'VOID';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  userId: string;
  status: InvoiceStatus;
  currency: string;
  totalAmount: string;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface PaymentTransaction {
  id: string;
  invoiceId: string | null;
  userId: string;
  provider: PaymentProvider;
  providerTransactionReference: string | null;
  paymentPurpose: PaymentPurpose;
  status: PaymentTransactionStatus;
  amountMinor: string;
  currency: string;
  createdAt: string;
}

export interface CheckoutResult {
  invoiceId: string;
  transactionId: string;
  provider: PaymentProvider;
  checkoutUrl?: string;
  providerReference?: string;
  reusedExistingSession: boolean;
}

export interface PaymentProviderInfo {
  id: PaymentProvider;
  displayName: string;
  isLive: boolean;
  isSandbox: boolean;
  supportedCountries: string[];
  supportedCurrencies: string[];
}

// ── Broker (frontend-safe view — no credentials) ────────────────────────────

export type BrokerConnectionStatus =
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'DISCONNECTED';

export interface BrokerConnectionView {
  id: string;
  userId: string;
  brokerId: string;
  accountType: 'DEMO' | 'LIVE';
  status: BrokerConnectionStatus;
  currency: string;
  /** Broker credentials are NEVER included in frontend responses. */
  createdAt: string;
}

// ── Health ──────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  environment: string;
  version: string;
  database: 'connected' | 'disconnected';
}

// ── API error ───────────────────────────────────────────────────────────────

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}
