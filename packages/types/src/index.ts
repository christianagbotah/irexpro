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

// ── Sprint 28: Password reset ───────────────────────────────────────────────

/** POST /auth/forgot-password request body. */
export interface ForgotPasswordRequest {
  /** Email address or international phone number (e.g. +233241234567). */
  identifier: string;
}

/**
 * POST /auth/forgot-password response.
 *
 * ALWAYS the same generic message — does NOT reveal whether the account exists.
 * This prevents account enumeration.
 */
export interface ForgotPasswordResponse {
  message: string;
}

/**
 * POST /auth/reset-password request body.
 *
 * Supports two flows:
 *   1. Email token: { token, password }
 *   2. Phone code: { identifier, code, password }
 *
 * The controller routes to the appropriate service method based on which
 * fields are present.
 */
export interface ResetPasswordRequest {
  /** Raw reset token from the email reset link (email flow). */
  token?: string;
  /** Phone number or email (phone code flow). */
  identifier?: string;
  /** 6-digit numeric code sent via SMS (phone code flow). */
  code?: string;
  /** New password (min 12 chars, must contain letters + numbers). */
  password: string;
}

export interface ResetPasswordResponse {
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
//
// Subscription-retirement (SUBSCRIPTION-RETIREMENT-IMPL):
// The types in this section are DEPRECATED. The subscription billing model
// has been retired — iRexPro now operates on a performance-fee-only model.
// These types are retained for historical/compatibility reasons (existing
// migrations, existing API client method signatures) but should NOT be used
// by new code. New code should reference the performance-fee types instead.

/**
 * @deprecated Subscription-retirement (SUBSCRIPTION-RETIREMENT-IMPL):
 *   Subscriptions are no longer sold. Retained for historical compatibility
 *   with existing database rows and migrations only.
 */
export type BillingInterval = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

/**
 * @deprecated Subscription-retirement (SUBSCRIPTION-RETIREMENT-IMPL):
 *   Subscription plans are no longer sold. Retained for historical
 *   compatibility only — do not use in new code.
 */
export interface SubscriptionPlan {
  id: string;
  name: string;
  billingInterval: BillingInterval;
  amountCents: string;
  currency: string;
  isActive: boolean;
}

/**
 * @deprecated Subscription-retirement (SUBSCRIPTION-RETIREMENT-IMPL):
 *   Subscription status is no longer used by the live billing flow. Retained
 *   for historical compatibility only — do not use in new code.
 */
export type SubscriptionStatus =
  | 'ACTIVE'
  | 'TRIAL'
  | 'PAST_DUE'
  | 'CANCELLED'
  | 'EXPIRED';

/**
 * @deprecated Subscription-retirement (SUBSCRIPTION-RETIREMENT-IMPL):
 *   User subscriptions are no longer created. Retained for historical
 *   compatibility only — existing rows remain in the database for audit but
 *   no new subscriptions can be created. Use the performance-fee flow instead.
 */
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

/**
 * @deprecated Subscription-retirement (SUBSCRIPTION-RETIREMENT-IMPL):
 *   Subscription checkout is no longer performed. Retained for historical
 *   compatibility with the API client signature only — new code should
 *   use the performance-fee checkout flow instead.
 */
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

/**
 * Sprint 29 amendment: updated to match the backend's 5-status enum
 * (apps/api/src/modules/broker/interfaces/broker-adapter.interface.ts).
 */
export type BrokerConnectionStatus =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'ERROR'
  | 'SUSPENDED';

export interface BrokerConnectionView {
  id: string;
  userId: string;
  brokerId: string;
  brokerName: string;
  displayName: string | null;
  accountId: string | null;
  accountType: 'DEMO' | 'LIVE';
  accountCurrency: string | null;
  accountLeverage: number | null;
  status: BrokerConnectionStatus;
  demoValidated: boolean;
  liveTradingEnabled: boolean;
  lastHealthCheckAt: string | null;
  lastSyncAt: string | null;
  lastErrorMessage: string | null;
  /** Broker credentials are NEVER included in frontend responses. */
  createdAt: string;
  updatedAt: string;
}

/** Supported broker info (GET /broker/connections/supported). */
export interface SupportedBroker {
  brokerId: string;
  brokerName: string;
  supportsDemo: boolean;
  supportsLive: boolean;
}

/** Request body for POST /broker/connections (create connection). */
export interface CreateBrokerConnectionRequest {
  brokerId: string;
  accountType: 'DEMO' | 'LIVE';
  accountId: string;
  apiKey?: string;
  apiSecret?: string;
  serverUrl?: string;
  displayName?: string;
}

/** Result of POST /broker/connections/test (no persistence). */
export interface BrokerTestResult {
  success: boolean;
  accountId?: string;
  errorMessage?: string;
}

// ── Sprint 29: Onboarding + Risk Profile ─────────────────────────────────────

/** Onboarding step identifiers. */
export type OnboardingStep = 'PROFILE' | 'RISK_PROFILE' | 'BROKER_CONNECTION';
export type OnboardingNextStep = OnboardingStep | 'READY';

/** GET /users/me/onboarding-status response. */
export interface OnboardingStatus {
  profileCompleted: boolean;
  riskProfileCompleted: boolean;
  brokerConnected: boolean;
  brokerConnectionStatus: BrokerConnectionStatus;
  canStartTrading: boolean;
  missingSteps: OnboardingStep[];
  nextStep: OnboardingNextStep;
}

/** Self-reported trading experience level. */
export type TradingExperienceLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'PROFESSIONAL';

/** PATCH /users/me request body (onboarding profile update). */
export interface UpdateMyProfileRequest {
  firstName?: string;
  lastName?: string;
  countryCode?: string;
  timezone?: string;
  preferredCurrency?: string;
  tradingExperienceLevel?: TradingExperienceLevel;
}

/** Allowed trading mode (Sprint 29). */
export type AllowedTradingMode = 'PAPER_ONLY' | 'SEMI_AUTO' | 'FULL_AUTO';

/** GET /risk/profile response (frontend-safe — no secrets). */
export interface RiskProfile {
  id: string;
  userId: string;
  killSwitchActive: boolean;
  killSwitchReason: string | null;
  maxDailyLossPercent: string;
  maxDrawdownPercent: string;
  maxOpenTrades: number;
  maxDailyTrades: number;
  maxPositionSizeLot: string;
  minStopLossPips: string;
  allowedInstruments: string[] | null;
  maxVolatilityScore: string;
  rejectLowLiquidity: boolean;
  // Sprint 29 fields:
  riskAcknowledgementAccepted: boolean;
  riskAcknowledgementAcceptedAt: string | null;
  maxTradeRiskPercent: string;
  maxLeverageAllowed: number;
  allowedTradingModes: AllowedTradingMode;
  createdAt: string;
  updatedAt: string;
}

/** PATCH /risk/profile request body. */
export interface UpdateRiskProfileRequest {
  maxDailyLossPercent?: number;
  maxDrawdownPercent?: number;
  maxOpenTrades?: number;
  maxDailyTrades?: number;
  maxPositionSizeLot?: number;
  minStopLossPips?: number;
  allowedInstruments?: string[] | null;
  maxVolatilityScore?: number;
  rejectLowLiquidity?: boolean;
  // Sprint 29:
  maxTradeRiskPercent?: number;
  maxLeverageAllowed?: number;
  allowedTradingModes?: AllowedTradingMode;
  riskAcknowledgementAccepted?: boolean;
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

// ── Presentation: enum/label humanization ────────────────────────────────────
//
// Presentation-only utility for rendering backend enum values as human-readable
// labels in the UI. This is PURELY presentational: it does NOT modify any enum
// value, API payload, database value, CHECK constraint, role constant,
// RolesGuard expectation, permission check, route guard, or test that validates
// raw API/domain values.
//
// Example: SUPER_ADMIN → "Super Admin", PENDING_REVIEW → "Pending Review".
//
// Behavior:
//   - null/undefined/empty → '' (safe for optional fields)
//   - splits on underscores, then title-cases each word
//   - preserves already-human-readable text (e.g. "Active" stays "Active")
//   - does NOT alter identifiers; only the rendered label changes
//
// Why this lives here: every frontend app (web, admin, mobile) imports from
// @irexpro/types for the enum/string-literal contracts. Co-locating the
// presentation formatter avoids duplicated `.replace('_', ' ')` calls across
// components and keeps a single authoritative humanization rule.
/**
 * Format a backend enum string as a human-readable label.
 *
 * `SUPER_ADMIN` → `Super Admin`
 * `PENDING_REVIEW` → `Pending Review`
 * `BROKER_CONNECTED` → `Broker Connected`
 *
 * Safely handles null/undefined/empty (returns ''). Preserves
 * already-human-readable text. Does NOT alter the input value or any
 * backend/domain enum.
 */
export function formatEnumLabel(value: string | null | undefined): string {
  if (!value) return '';
  // Split on underscores, trim, and title-case each token.
  return value
    .split('_')
    .map((word) => word.trim())
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
