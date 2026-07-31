import {
  ApiError,
  AuthTokens,
  AuthUser,
  CheckoutResult,
  HealthResponse,
  Invoice,
  LoginRequest,
  LogoutResponse,
  PaymentProviderInfo,
  PaymentTransaction,
  RefreshRequest,
  RegisterRequest,
  SubscriptionPlan,
  UserSubscription,
} from '@irexpro/types';

/**
 * Options for the shared API client.
 *
 * `baseUrl` is the FULL API base URL (e.g. "https://irexpro.lightworldtech.com/api/v1"
 * or "http://127.0.0.1:3010/api/v1"). It MUST be supplied by each app from its
 * own env config — the shared client NEVER hardcodes localhost or any domain.
 *
 * `getAccessToken` is an optional getter used to attach the `Authorization:
 * Bearer <token>` header to authenticated requests. Each app supplies its own
 * token-storage strategy (in-memory for web/admin production, secure storage
 * for mobile). The shared client never reads env directly and never stores
 * tokens itself.
 *
 * The backend is token-based (NOT httpOnly-cookie-based): /auth/login and
 * /auth/register return `{ accessToken, refreshToken }` in the JSON body. The
 * app is responsible for storing these securely and passing the access token
 * back via `getAccessToken`. `includeCredentials` is kept for same-origin
 * cookie scenarios but is not the primary auth mechanism.
 */
export interface CreateApiClientOptions {
  baseUrl: string;
  includeCredentials?: boolean;
  /** Optional token getter — used to attach Authorization: Bearer <token>. */
  getAccessToken?: () => string | null | undefined;
}

export interface ApiClient {
  readonly baseUrl: string;

  // Health
  health(): Promise<HealthResponse>;

  // Auth — matches the verified backend (apps/api/src/modules/auth/auth.controller.ts)
  /** POST /auth/register → { accessToken, refreshToken } */
  register(body: RegisterRequest): Promise<AuthTokens>;
  /** POST /auth/login → { accessToken, refreshToken } */
  login(body: LoginRequest): Promise<AuthTokens>;
  /**
   * POST /auth/refresh → { accessToken, refreshToken }
   * Sprint 25 hybrid: if refreshToken is provided (mobile), it goes in the JSON
   * body. If omitted (web/admin), the request relies on the httpOnly refresh
   * cookie sent automatically via credentials:'include'.
   */
  refresh(refreshToken?: string): Promise<AuthTokens>;
  /** POST /auth/logout (requires Authorization: Bearer) → { message } */
  logout(): Promise<LogoutResponse>;
  /** GET /auth/me (requires Authorization: Bearer) → current user */
  me(): Promise<AuthUser>;

  // Subscriptions / plans
  listPlans(): Promise<SubscriptionPlan[]>;
  mySubscription(): Promise<UserSubscription | null>;

  // Payments
  listProviders(): Promise<PaymentProviderInfo[]>;
  initiateSubscriptionCheckout(
    planId: string,
    currency: string,
    provider?: string,
  ): Promise<CheckoutResult>;
  getInvoice(invoiceId: string): Promise<Invoice>;
  getTransactionStatus(transactionId: string): Promise<PaymentTransaction>;

  /** Low-level fetch for app-specific endpoints. */
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

export class ApiClientError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/**
 * Create a typed API client bound to a base URL.
 *
 * The caller is responsible for reading the base URL from the correct env var
 * for its platform:
 *   - Next.js web/admin: process.env.NEXT_PUBLIC_API_BASE_URL
 *   - Expo mobile:       process.env.EXPO_PUBLIC_API_BASE_URL
 *
 * The shared client itself never reads env directly, so it stays
 * platform-agnostic and never hardcodes a URL.
 */
export function createApiClient(options: CreateApiClientOptions): ApiClient {
  const { baseUrl, includeCredentials = false, getAccessToken } = options;

  if (!baseUrl) {
    throw new Error(
      'ApiClient: baseUrl is required. Pass the API base URL from your app env config.',
    );
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((init?.headers as Record<string, string>) ?? {}),
    };

    const token = getAccessToken?.();
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers,
        credentials: includeCredentials ? 'include' : 'same-origin',
      });
    } catch (err) {
      throw new ApiClientError(
        0,
        `Network error contacting API: ${(err as Error).message}`,
      );
    }

    if (!res.ok) {
      let body: ApiError | null = null;
      try {
        body = (await res.json()) as ApiError;
      } catch {
        /* non-JSON error */
      }
      throw new ApiClientError(
        res.status,
        body?.message ?? res.statusText,
        body,
      );
    }

    if (res.status === 204) {
      return undefined as T;
    }
    return (await res.json()) as T;
  }

  return {
    baseUrl,

    health: () => request<HealthResponse>('/health'),

    register: (body) =>
      request<AuthTokens>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    login: (body) =>
      request<AuthTokens>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    refresh: (refreshToken?: string) =>
      request<AuthTokens>('/auth/refresh', {
        method: 'POST',
        // Sprint 25: if refreshToken is provided (mobile), send it in the body.
        // If omitted (web/admin), send empty JSON body {} — the httpOnly cookie
        // is sent automatically via credentials:'include'. Sending '{}' instead
        // of undefined ensures NestJS ValidationPipe can parse the body.
        body: refreshToken
          ? JSON.stringify({ refreshToken } satisfies RefreshRequest)
          : JSON.stringify({}),
      }),

    logout: () =>
      request<LogoutResponse>('/auth/logout', { method: 'POST' }),

    me: () => request<AuthUser>('/auth/me'),

    listPlans: () => request<SubscriptionPlan[]>('/subscriptions/plans'),

    mySubscription: async () => {
      try {
        return await request<UserSubscription>('/subscriptions/me');
      } catch (err) {
        if (err instanceof ApiClientError && err.statusCode === 404) return null;
        throw err;
      }
    },

    listProviders: () =>
      request<PaymentProviderInfo[]>('/payments/providers'),

    initiateSubscriptionCheckout: (planId, currency, provider) =>
      request<CheckoutResult>('/subscriptions/checkout', {
        method: 'POST',
        body: JSON.stringify({ planId, currency, provider }),
      }),

    getInvoice: (invoiceId) =>
      request<Invoice>(`/payments/invoices/${invoiceId}`),

    getTransactionStatus: (transactionId) =>
      request<PaymentTransaction>(
        `/payments/transactions/${transactionId}/status`,
      ),

    request,
  };
}
