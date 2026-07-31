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
//
// These types match the verified backend auth contract (apps/api/src/modules/auth):
//   POST /auth/register → { accessToken, refreshToken }
//   POST /auth/login    → { accessToken, refreshToken }
//   POST /auth/refresh  → body { refreshToken } → { accessToken, refreshToken }
//   POST /auth/logout   → requires Authorization: Bearer <accessToken>
//   GET  /auth/me       → requires Authorization: Bearer <accessToken> → AuthUser
//
// The backend is TOKEN-BASED (Bearer access token + refresh token in the body),
// NOT httpOnly-cookie-based. The frontend is responsible for storing the
// access token securely (httpOnly cookie is NOT available here; the backend
// returns tokens in the JSON body). Web apps should use a secure, in-memory
// store for the access token; mobile apps should use the platform secure
// storage (expo-secure-store / Keychain / Keystore). Production web/admin must
// NOT store access tokens in localStorage.

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'USER';

export type UserStatus =
  | 'PENDING_VERIFICATION'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'CLOSED';

/**
 * The user object returned by GET /auth/me.
 * Matches the backend User entity minus passwordHash and mfaSecret (which the
 * backend strips via destructuring before returning).
 */
export interface AuthUser {
  id: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  lastLoginAt: string | null;
  countryCode: string | null;
  timezone: string | null;
  preferredCurrency: string | null;
  mfaEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  /**
   * Roles are NOT included in the /auth/me response (the backend returns the
   * raw User entity without eager-loading userRoles). The frontend may know
   * roles from the JWT payload claims, or may need a separate roles endpoint.
   * For now this is optional and may be populated by the app from the decoded
   * access token if needed.
   */
  roles?: UserRole[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  countryCode?: string;
  firstName?: string;
  lastName?: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

/** The token pair returned by /auth/login, /auth/register, and /auth/refresh. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LogoutResponse {
  message: string;
}

/**
 * Convenience: an authenticated session = the access token + the current user.
 * The frontend assembles this by calling /auth/login (or /auth/refresh) then
 * /auth/me with the returned access token.
 */
export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
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
