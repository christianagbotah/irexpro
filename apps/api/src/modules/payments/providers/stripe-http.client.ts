import { Injectable, Logger } from '@nestjs/common';

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_ERROR_MESSAGE_LENGTH = 200;

export interface StripeHttpRequestOptions {
  method: 'GET' | 'POST';
  secretKey: string;
  /** Sent as application/x-www-form-urlencoded (Stripe's documented request format). */
  body?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface StripeHttpResult<T> {
  ok: boolean;
  status: number;
  body: T | null;
  /** Sanitised, length-capped message safe to surface to callers/logs. */
  errorMessage?: string;
}

/**
 * Flattens a nested object into Stripe's bracket-notation form fields, e.g.
 * `{ line_items: [{ price_data: { currency: 'usd' } }] }` becomes
 * `line_items[0][price_data][currency]=usd`. Required because Stripe's REST
 * API expects `application/x-www-form-urlencoded` bodies, not JSON.
 */
function flattenToFormParams(value: unknown, prefix: string, out: URLSearchParams): void {
  if (value === undefined || value === null) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenToFormParams(item, `${prefix}[${index}]`, out));
    return;
  }

  if (typeof value === 'object') {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      flattenToFormParams(val, prefix ? `${prefix}[${key}]` : key, out);
    }
    return;
  }

  out.append(prefix, String(value));
}

function toFormBody(body: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    flattenToFormParams(value, key, params);
  }
  return params;
}

/**
 * StripeHttpClient — thin, injectable HTTP wrapper around the Stripe REST API.
 *
 * Uses Node's built-in `fetch` (consistent with `PaystackHttpClient` /
 * `AiEngineClient`) instead of pulling in the Stripe SDK — Stripe's REST API
 * surface used here (Checkout Sessions, PaymentIntents) is small enough that a
 * dedicated SDK dependency is not justified for this sprint.
 *
 * RULES:
 * - Adds a request timeout via AbortController — never hangs indefinitely.
 * - NEVER logs the Authorization header, secret key, or raw response body.
 * - Sanitises and length-caps any error message before returning it.
 * - Requests use `application/x-www-form-urlencoded`, per Stripe's documented
 *   request format for Checkout Session / PaymentIntent creation.
 * - Tests must mock this client — it must never be exercised against the real
 *   Stripe network in the test suite.
 */
@Injectable()
export class StripeHttpClient {
  private readonly logger = new Logger(StripeHttpClient.name);

  async request<T = unknown>(
    url: string,
    options: StripeHttpRequestOptions,
  ): Promise<StripeHttpResult<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${options.secretKey}`,
          ...(options.method === 'POST'
            ? { 'Content-Type': 'application/x-www-form-urlencoded' }
            : {}),
          Accept: 'application/json',
        },
        body: options.body ? toFormBody(options.body).toString() : undefined,
        signal: controller.signal,
      });

      const parsed = await this.safeParseJson<Record<string, unknown>>(response);

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          body: parsed as T | null,
          errorMessage:
            this.sanitize(this.extractErrorMessage(parsed)) ??
            `Stripe request failed with status ${response.status}`,
        };
      }

      return { ok: true, status: response.status, body: parsed as T | null };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const message = isAbort ? 'Stripe request timed out' : 'Stripe request failed: network error';
      this.logger.warn(`[Stripe] HTTP ${options.method} request error: ${message}`);
      return { ok: false, status: 0, body: null, errorMessage: message };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async safeParseJson<T>(response: Response): Promise<T | null> {
    try {
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  /** Stripe error responses use the shape `{ error: { message, type, code } }`. */
  private extractErrorMessage(parsed: Record<string, unknown> | null): string | undefined {
    const error = parsed?.['error'] as Record<string, unknown> | undefined;
    const message = error?.['message'];
    return typeof message === 'string' ? message : undefined;
  }

  /** Truncates and defends against undefined/non-string provider messages. */
  private sanitize(message?: string | null): string | undefined {
    if (!message || typeof message !== 'string') return undefined;
    return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
  }
}
