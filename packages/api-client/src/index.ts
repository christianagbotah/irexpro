import {
  ApiError,
  AuthSession,
  AuthUser,
  CheckoutResult,
  HealthResponse,
  Invoice,
  LoginRequest,
  PaymentProviderInfo,
  PaymentTransaction,
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
 * `includeCredentials` enables cookie-based auth (httpOnly refresh token) on
 * web. Mobile apps typically pass false and attach a Bearer token via headers.
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

  // Auth
  login(body: LoginRequest): Promise<AuthSession>;
  me(): Promise<AuthUser>;
  refresh(): Promise<AuthSession>;
  logout(): Promise<void>;

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

    login: (body) =>
      request<AuthSession>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    me: () => request<AuthUser>('/auth/me'),

    refresh: () =>
      request<AuthSession>('/auth/refresh', { method: 'POST' }),

    logout: () => request<void>('/auth/logout', { method: 'POST' }),

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
