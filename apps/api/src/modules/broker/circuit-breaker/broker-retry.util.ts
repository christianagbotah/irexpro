import { Logger } from '@nestjs/common';
import { BrokerAdapterError, RETRYABLE_BROKER_ERRORS } from '../interfaces/broker-adapter.errors';

const logger = new Logger('BrokerRetry');

export interface RetryOptions {
  /** Max retry attempts (not counting the initial attempt). Default: 2. */
  maxRetries?: number;
  /** Initial delay in ms before the first retry. Default: 500ms. */
  initialDelayMs?: number;
  /** Backoff multiplier. Default: 2 (exponential). */
  backoffMultiplier?: number;
  /** Max delay cap. Default: 5000ms. */
  maxDelayMs?: number;
  /** Operation name for logging. */
  operationName?: string;
}

/**
 * Execute a broker operation with retry-with-backoff for transient failures.
 *
 * Only retries on RETRYABLE_BROKER_ERRORS (CONNECTION_TIMEOUT, RATE_LIMITED,
 * BROKER_SERVER_ERROR). Non-retryable errors (AUTHENTICATION_FAILED,
 * INSUFFICIENT_MARGIN, etc.) are thrown immediately.
 *
 * The callback receives the attempt number (0-based) so it can adjust behavior
 * if needed.
 *
 * Example:
 *   const result = await withBrokerRetry(
 *     () => adapter.placeOrder(order),
 *     { operationName: 'placeOrder', maxRetries: 3 },
 *   );
 */
export async function withBrokerRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 2,
    initialDelayMs = 500,
    backoffMultiplier = 2,
    maxDelayMs = 5000,
    operationName = 'brokerOperation',
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;

      // Check if the error is retryable
      const isRetryable =
        err instanceof BrokerAdapterError && RETRYABLE_BROKER_ERRORS.has(err.code);

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }

      // Calculate backoff delay
      const delayMs = Math.min(initialDelayMs * Math.pow(backoffMultiplier, attempt), maxDelayMs);

      logger.warn(
        `${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}) — ` +
          `retryable error: ${(err as Error).message}. Retrying in ${delayMs}ms...`,
      );

      await sleep(delayMs);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
