import { Injectable, Logger } from '@nestjs/common';

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_ERROR_MESSAGE_LENGTH = 200;

export interface PaystackHttpRequestOptions {
  method: 'GET' | 'POST';
  secretKey: string;
  body?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface PaystackHttpResult<T> {
  ok: boolean;
  status: number;
  body: T | null;
  /** Sanitised, length-capped message safe to surface to callers/logs. */
  errorMessage?: string;
}

/**
 * PaystackHttpClient — thin, injectable HTTP wrapper around the Paystack REST API.
 *
 * Uses Node's built-in `fetch` (consistent with `AiEngineClient`) instead of pulling
 * in a Paystack SDK or an HTTP library dependency.
 *
 * RULES:
 * - Adds a request timeout via AbortController — never hangs indefinitely.
 * - NEVER logs the Authorization header, secret key, or raw response body.
 * - Sanitises and length-caps any error message before returning it.
 * - Normalises Paystack's `status: false` API-level failures into a safe error result
 *   (Paystack returns HTTP 200 with `status: false` for some failure cases).
 * - Tests must mock this client — it must never be exercised against the real
 *   Paystack network in the test suite.
 */
@Injectable()
export class PaystackHttpClient {
  private readonly logger = new Logger(PaystackHttpClient.name);

  async request<T = unknown>(
    url: string,
    options: PaystackHttpRequestOptions,
  ): Promise<PaystackHttpResult<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${options.secretKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const parsed = await this.safeParseJson<Record<string, unknown>>(response);

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          body: parsed as T | null,
          errorMessage:
            this.sanitize(parsed?.['message'] as string | undefined) ??
            `Paystack request failed with status ${response.status}`,
        };
      }

      // Paystack convention: HTTP 200 with a body-level `status: false` still
      // indicates a failed operation and must be treated as a failure.
      if (parsed && parsed['status'] === false) {
        return {
          ok: false,
          status: response.status,
          body: parsed as T | null,
          errorMessage:
            this.sanitize(parsed['message'] as string | undefined) ??
            'Paystack reported a failed request',
        };
      }

      return { ok: true, status: response.status, body: parsed as T | null };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const message = isAbort
        ? 'Paystack request timed out'
        : 'Paystack request failed: network error';
      this.logger.warn(`[Paystack] HTTP ${options.method} request error: ${message}`);
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

  /** Truncates and defends against undefined/non-string provider messages. */
  private sanitize(message?: string | null): string | undefined {
    if (!message || typeof message !== 'string') return undefined;
    return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
  }
}
