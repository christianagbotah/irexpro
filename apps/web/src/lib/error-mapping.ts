/**
 * mapApiError — translates an unknown API/network error into a safe,
 * user-facing message.
 *
 * UX-1 utility.
 *
 * SECURITY: This function NEVER exposes SQL errors, stack traces, raw
 * exception names, credentials, tokens, internal URLs, or anything that
 * looks like internal diagnostics. Any unrecognized shape falls back to a
 * generic "Something went wrong" message.
 *
 * Recognized error codes:
 * - TRADING_NOT_READY        → "Your trading setup is not ready." + missingSteps
 * - VALIDATION_ERROR         → "Please check the highlighted fields and try again."
 * - UNAUTHORIZED             → "Your session has expired. Please sign in again."
 * - FORBIDDEN                → "You don't have permission to perform this action."
 * - BROKER_CONNECTION_FAILED → "The broker connection test failed. Please check your credentials."
 * - BROKER_HEALTH_STALE      → "Your broker health check is outdated. Please test your connection."
 * - RISK_LIMIT_EXCEEDED      → "The requested action exceeds your risk limits."
 * - Network errors           → "Unable to reach the server. Please check your connection."
 * - Default                  → "Something went wrong. Please try again."
 */

export interface ApiErrorResult {
  message: string;
  code?: string;
  /** Onboarding route paths the user should complete (only set for TRADING_NOT_READY). */
  missingSteps?: string[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MESSAGE = 'Something went wrong. Please try again.';
const NETWORK_MESSAGE = 'Unable to reach the server. Please check your connection.';

/** Map of known error codes → safe user-facing copy. */
const CODE_MESSAGES: Record<string, string> = {
  TRADING_NOT_READY: 'Your trading setup is not ready.',
  VALIDATION_ERROR: 'Please check the highlighted fields and try again.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: "You don't have permission to perform this action.",
  BROKER_CONNECTION_FAILED:
    'The broker connection test failed. Please check your credentials.',
  BROKER_HEALTH_STALE:
    'Your broker health check is outdated. Please test your connection.',
  RISK_LIMIT_EXCEEDED: 'The requested action exceeds your risk limits.',
};

/**
 * Whitelist of onboarding step keys the backend is allowed to surface. Anything
 * else is silently dropped (we never trust raw user-facing step names from the
 * API — they could be anything).
 */
const KNOWN_ONBOARDING_STEPS: Record<string, string> = {
  profile: '/onboarding/profile',
  broker: '/onboarding/broker',
  risk: '/onboarding/risk',
  subscription: '/payments/success',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Tests whether an error looks like a network/fetch failure (no HTTP response
 * was received). Covers: TypeError from fetch, ERR_NETWORK, ECONNABORTED,
 * aborted requests, and typical axios `isAxiosError` shapes.
 */
function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;

  const anyErr = err as Record<string, unknown>;

  // fetch() throws a TypeError on network failure.
  if (err instanceof TypeError) return true;

  // Axios-style: { isAxiosError: true, request: {...}, response: undefined }
  if (anyErr.isAxiosError === true && anyErr.response === undefined && anyErr.request !== undefined) {
    return true;
  }

  const message = typeof anyErr.message === 'string' ? anyErr.message.toLowerCase() : '';
  if (
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('err_network') ||
    message.includes('econnaborted') ||
    message.includes('timeout') ||
    message.includes('internet connection') ||
    message.includes('network request failed')
  ) {
    return true;
  }

  // fetch-style aborts / DOMExceptions.
  if (anyErr.name === 'AbortError') return true;

  return false;
}

/**
 * Safely extracts a `code` string from a backend error body. Looks in the
 * common locations used by the iRexPro API client and various HTTP libraries.
 */
function extractCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const anyErr = err as Record<string, unknown>;

  const candidates: unknown[] = [
    anyErr.code,
    (anyErr.response as Record<string, unknown> | undefined)?.data &&
      ((anyErr.response as Record<string, unknown>).data as Record<string, unknown>).code,
    (anyErr.data as Record<string, unknown> | undefined)?.code,
    (anyErr.body as Record<string, unknown> | undefined)?.code,
    (anyErr.error as Record<string, unknown> | undefined)?.code,
    (anyErr.response as Record<string, unknown> | undefined)?.data &&
      ((anyErr.response as Record<string, unknown>).data as Record<string, unknown>).error &&
      (((anyErr.response as Record<string, unknown>).data as Record<string, unknown>).error as Record<string, unknown>)
        .code,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0 && c.length <= 128) {
      return c;
    }
  }
  return undefined;
}

/**
 * Extracts the list of missing onboarding steps for TRADING_NOT_READY, mapping
 * each to a known onboarding path. Unknown / suspicious step keys are dropped.
 */
function extractMissingSteps(err: unknown): string[] | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const anyErr = err as Record<string, unknown>;

  const candidates: unknown[] = [
    (anyErr.response as Record<string, unknown> | undefined)?.data &&
      ((anyErr.response as Record<string, unknown>).data as Record<string, unknown>).missingSteps,
    (anyErr.response as Record<string, unknown> | undefined)?.data &&
      ((anyErr.response as Record<string, unknown>).data as Record<string, unknown>).missing_steps,
    (anyErr.data as Record<string, unknown> | undefined)?.missingSteps,
    (anyErr.data as Record<string, unknown> | undefined)?.missing_steps,
    anyErr.missingSteps,
    anyErr.missing_steps,
  ];

  for (const c of candidates) {
    if (!Array.isArray(c)) continue;
    const mapped: string[] = [];
    for (const step of c) {
      if (typeof step !== 'string') continue;
      const key = step.toLowerCase().trim();
      const path = KNOWN_ONBOARDING_STEPS[key];
      if (path && !mapped.includes(path)) mapped.push(path);
    }
    if (mapped.length > 0) return mapped;
  }

  return undefined;
}

/**
 * Determines whether the HTTP status code suggests an auth/network failure we
 * should special-case. Returns the matching message or undefined.
 */
function messageForStatus(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const anyErr = err as Record<string, unknown>;
  const status =
    (anyErr.response as Record<string, unknown> | undefined)?.status ??
    anyErr.status ??
    (anyErr.data as Record<string, unknown> | undefined)?.status;
  if (typeof status !== 'number') return undefined;

  if (status === 401) return CODE_MESSAGES.UNAUTHORIZED;
  if (status === 403) return CODE_MESSAGES.FORBIDDEN;
  if (status === 0 || status >= 500) return NETWORK_MESSAGE;
  return undefined;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function mapApiError(error: unknown): ApiErrorResult {
  // 1. Network errors (no HTTP response).
  if (isNetworkError(error)) {
    return { message: NETWORK_MESSAGE };
  }

  // 2. Recognized backend error code.
  const code = extractCode(error);
  if (code && Object.prototype.hasOwnProperty.call(CODE_MESSAGES, code)) {
    const result: ApiErrorResult = { message: CODE_MESSAGES[code], code };
    if (code === 'TRADING_NOT_READY') {
      const steps = extractMissingSteps(error);
      // If the API didn't surface specific steps, default to all onboarding
      // routes — the user can complete whichever they haven't done yet.
      result.missingSteps = steps ?? [
        KNOWN_ONBOARDING_STEPS.profile,
        KNOWN_ONBOARDING_STEPS.broker,
        KNOWN_ONBOARDING_STEPS.risk,
      ];
    }
    return result;
  }

  // 3. Status-code-based inference (e.g. 401/403/5xx with no recognised code).
  const statusMessage = messageForStatus(error);
  if (statusMessage) {
    return { message: statusMessage };
  }

  // 4. Default — never leak raw error details.
  return { message: DEFAULT_MESSAGE };
}

export default mapApiError;
