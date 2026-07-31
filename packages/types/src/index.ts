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
//   POST /auth/register → { accessToken, refreshToken } + sets httpOnly refresh cookie
//   POST /auth/login    → { accessToken, refreshToken } + sets httpOnly refresh cookie
//   POST /auth/refresh  → cookie (web/admin) OR body { refreshToken } (mobile) → { accessToken, refreshToken }
//   POST /auth/logout   → requires Authorization: Bearer → clears refresh cookie
//   GET  /auth/me       → requires Authorization: Bearer → AuthUser (frontend-safe DTO with roles)
//
// Sprint 25 hybrid session strategy:
//   - Web/admin: access token in memory (NOT localStorage); refresh token in
//     httpOnly cookie set by the backend. Sessions survive page refresh via
//     /auth/refresh (cookie sent automatically with credentials:'include').
//   - Mobile: access + refresh tokens in Expo SecureStore (NOT AsyncStorage).
//     Sessions survive app restarts. Mobile sends refreshToken in the JSON
//     body to /auth/refresh.
//
// Sprint 25 /auth/me contract: the backend now returns a frontend-safe
// AuthUserDto (not the raw User entity). It includes roles (from the JWT
// payload) and firstName/lastName (from the UserProfile relation). Sensitive
// fields (passwordHash, mfaSecret, deletedAt, profile PII, userRoles) are
// never included.

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'USER';

export type UserStatus =
  | 'PENDING_VERIFICATION'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'CLOSED';

/**
 * The user object returned by GET /auth/me (Sprint 25 — frontend-safe DTO).
 * Matches the backend AuthUserDto (apps/api/src/modules/auth/dto/auth-user.dto.ts).
 * Only frontend-safe fields are included; sensitive fields are never present.
 */
export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  countryCode: string | null;
  status: UserStatus;
  /** Roles from the JWT payload — always present in the Sprint 25 /auth/me response. */
  roles: UserRole[];
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface LoginRequest {
  identifier: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterRequest {
  email?: string;
  phone?: string;
  password: string;
  countryCode?: string;
  firstName?: string;
  lastName?: string;
  rememberMe?: boolean;
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
