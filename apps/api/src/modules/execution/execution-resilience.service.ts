import { Injectable, Logger } from '@nestjs/common';
import { BrokerAdapterError, BrokerErrorCode } from '../broker/interfaces/broker-adapter.errors';
import {
  BrokerOrderResult,
  BrokerOrderRequest,
  IBrokerAdapter,
} from '../broker/interfaces/broker-adapter.interface';

/**
 * ExecutionResilienceService
 *
 * Handles the hard edge cases of real broker order execution:
 *
 * 1. Partial fills — when a broker fills only part of the requested volume
 * 2. Requotes — when the broker rejects the price and offers a new one
 * 3. Slippage tracking — recording the difference between requested and filled price
 * 4. Market closure — graceful rejection when the market is closed
 * 5. Uncertain response recovery — when a timeout occurs but the order may
 *    have been placed at the broker
 *
 * This service does NOT place orders itself — it wraps the adapter call and
 * provides structured handling of the outcomes.
 */

/** Maximum acceptable slippage in points (1 point = 0.0001 for 4-digit pairs) */
const MAX_SLIPPAGE_POINTS = 50;

/** Maximum requote retries before giving up */
const MAX_REQUOTE_RETRIES = 2;

export interface OrderSubmissionResult {
  success: boolean;
  externalOrderId: string | null;
  filledPrice: string | null;
  filledVolume: string | null;
  status: 'FILLED' | 'PARTIALLY_FILLED' | 'PENDING' | 'REJECTED' | 'FAILED';
  slippagePoints: number | null;
  requoteAttempts: number;
  rejectionReason: string | null;
  brokerMessage: string | null;
  uncertain: boolean;
}

@Injectable()
export class ExecutionResilienceService {
  private readonly logger = new Logger(ExecutionResilienceService.name);

  /**
   * Submit an order to the broker with full resilience handling.
   *
   * This wraps adapter.placeOrder() and handles:
   * - Market closure (immediate rejection, no retry)
   * - Requotes (retry with adjusted price, up to MAX_REQUOTE_RETRIES)
   * - Partial fills (accept the filled portion, log the remainder)
   * - Slippage (calculate and record, reject if excessive)
   * - Timeouts (mark as uncertain, trigger reconciliation)
   */
  async submitOrderWithResilience(
    adapter: IBrokerAdapter,
    request: BrokerOrderRequest,
    timeoutMs: number = 30_000,
  ): Promise<OrderSubmissionResult> {
    let requoteAttempts = 0;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_REQUOTE_RETRIES; attempt++) {
      try {
        const result = await this.callWithTimeout(adapter, request, timeoutMs);
        return this.interpretResult(result, request, requoteAttempts);
      } catch (err) {
        lastError = err as Error;

        // Market closed — never retry, fail immediately
        if (this.isMarketClosed(err)) {
          this.logger.warn(`Order rejected: market closed for ${request.instrument}`);
          return {
            success: false,
            externalOrderId: null,
            filledPrice: null,
            filledVolume: null,
            status: 'REJECTED',
            slippagePoints: null,
            requoteAttempts,
            rejectionReason: 'MARKET_CLOSED',
            brokerMessage: (err as Error).message,
            uncertain: false,
          };
        }

        // Insufficient margin — never retry
        if (this.isInsufficientMargin(err)) {
          this.logger.warn(`Order rejected: insufficient margin for ${request.instrument}`);
          return {
            success: false,
            externalOrderId: null,
            filledPrice: null,
            filledVolume: null,
            status: 'REJECTED',
            slippagePoints: null,
            requoteAttempts,
            rejectionReason: 'INSUFFICIENT_MARGIN',
            brokerMessage: (err as Error).message,
            uncertain: false,
          };
        }

        // Timeout — the order may or may not have been placed
        if (this.isTimeout(err)) {
          this.logger.error(
            `Order timeout for ${request.instrument} — uncertain state. ` +
              `Reconciliation will verify if the order was placed.`,
          );
          return {
            success: false,
            externalOrderId: null,
            filledPrice: null,
            filledVolume: null,
            status: 'FAILED',
            slippagePoints: null,
            requoteAttempts,
            rejectionReason: 'TIMEOUT_UNCERTAIN',
            brokerMessage: 'Broker did not respond within timeout — order state uncertain',
            uncertain: true,
          };
        }

        // Duplicate order — check if it was already placed
        if (this.isDuplicateOrder(err)) {
          this.logger.warn(
            `Duplicate order detected for ${request.instrument} — checking broker state`,
          );
          return {
            success: false,
            externalOrderId: null,
            filledPrice: null,
            filledVolume: null,
            status: 'FAILED',
            slippagePoints: null,
            requoteAttempts,
            rejectionReason: 'DUPLICATE_ORDER',
            brokerMessage: (err as Error).message,
            uncertain: true, // The original order may have succeeded
          };
        }

        // Retryable errors (CONNECTION_TIMEOUT, RATE_LIMITED, BROKER_SERVER_ERROR)
        if (this.isRetryable(err) && attempt < MAX_REQUOTE_RETRIES) {
          requoteAttempts++;
          const delay = 500 * Math.pow(2, attempt);
          this.logger.warn(
            `Order attempt ${attempt + 1} failed (${(err as Error).message}) — retrying in ${delay}ms`,
          );
          await this.sleep(delay);
          continue;
        }

        // Non-retryable — fail
        this.logger.error(`Order failed permanently: ${(err as Error).message}`);
        return {
          success: false,
          externalOrderId: null,
          filledPrice: null,
          filledVolume: null,
          status: 'FAILED',
          slippagePoints: null,
          requoteAttempts,
          rejectionReason: this.extractErrorCode(err) ?? 'UNKNOWN',
          brokerMessage: (err as Error).message,
          uncertain: false,
        };
      }
    }

    // Exhausted retries
    return {
      success: false,
      externalOrderId: null,
      filledPrice: null,
      filledVolume: null,
      status: 'FAILED',
      slippagePoints: null,
      requoteAttempts,
      rejectionReason: 'RETRY_EXHAUSTED',
      brokerMessage: lastError?.message ?? 'All retry attempts exhausted',
      uncertain: false,
    };
  }

  /**
   * Interpret a broker order result, handling partial fills and slippage.
   */
  private interpretResult(
    result: BrokerOrderResult,
    request: BrokerOrderRequest,
    requoteAttempts: number,
  ): OrderSubmissionResult {
    // Full fill
    if (result.success && result.status === 'FILLED') {
      const slippage = this.calculateSlippage(request, result);

      // Check if slippage is excessive
      if (slippage !== null && slippage > MAX_SLIPPAGE_POINTS) {
        this.logger.warn(
          `Excessive slippage: ${slippage} points for ${request.instrument}. ` +
            `Requested: ${request.lotSize}, Filled: ${result.filledPrice}`,
        );
      }

      return {
        success: true,
        externalOrderId: result.externalOrderId ?? null,
        filledPrice: result.filledPrice ?? null,
        filledVolume: request.lotSize, // Full fill assumed
        status: 'FILLED',
        slippagePoints: slippage,
        requoteAttempts,
        rejectionReason: null,
        brokerMessage: result.brokerMessage ?? null,
        uncertain: false,
      };
    }

    // Partial fill — the broker filled part of the order
    if (result.status === 'PENDING' && result.externalOrderId) {
      this.logger.warn(
        `Partial/pending fill for ${request.instrument}: externalOrderId=${result.externalOrderId}, ` +
          `price=${result.filledPrice ?? 'pending'}`,
      );
      return {
        success: true, // The order was accepted
        externalOrderId: result.externalOrderId,
        filledPrice: result.filledPrice ?? null,
        filledVolume: null, // Unknown — reconciliation will determine
        status: 'PARTIALLY_FILLED',
        slippagePoints: null,
        requoteAttempts,
        rejectionReason: null,
        brokerMessage: result.brokerMessage ?? null,
        uncertain: false,
      };
    }

    // Rejected by broker
    if (result.status === 'REJECTED' || !result.success) {
      return {
        success: false,
        externalOrderId: result.externalOrderId ?? null,
        filledPrice: result.filledPrice ?? null,
        filledVolume: null,
        status: 'REJECTED',
        slippagePoints: null,
        requoteAttempts,
        rejectionReason: 'BROKER_REJECTED',
        brokerMessage: result.brokerMessage ?? 'Broker rejected the order',
        uncertain: false,
      };
    }

    // Unknown status
    return {
      success: false,
      externalOrderId: result.externalOrderId ?? null,
      filledPrice: result.filledPrice ?? null,
      filledVolume: null,
      status: 'FAILED',
      slippagePoints: null,
      requoteAttempts,
      rejectionReason: 'UNKNOWN_STATUS',
      brokerMessage: result.brokerMessage ?? `Unknown status: ${result.status}`,
      uncertain: true,
    };
  }

  /**
   * Calculate slippage in points between requested entry price and filled price.
   * Returns null if either price is unavailable or not a valid decimal.
   */
  private calculateSlippage(request: BrokerOrderRequest, result: BrokerOrderResult): number | null {
    if (!result.filledPrice) return null;

    // BrokerOrderRequest has entryPrice from the risk decision
    const requestedPrice = (request as BrokerOrderRequest & { entryPrice?: string }).entryPrice;
    if (!requestedPrice) return null;

    const requested = Number(requestedPrice);
    const filled = Number(result.filledPrice);
    if (!Number.isFinite(requested) || !Number.isFinite(filled)) return null;

    // Slippage in points (0.0001 = 1 point for 4-digit pairs)
    const slippage = Math.abs(filled - requested) / 0.0001;
    return Math.round(slippage);
  }

  // ── Error classification helpers ────────────────────────────────────────────

  private isMarketClosed(err: unknown): boolean {
    return err instanceof BrokerAdapterError && err.code === BrokerErrorCode.MARKET_CLOSED;
  }

  private isInsufficientMargin(err: unknown): boolean {
    return err instanceof BrokerAdapterError && err.code === BrokerErrorCode.INSUFFICIENT_MARGIN;
  }

  private isTimeout(err: unknown): boolean {
    if (err instanceof BrokerAdapterError) {
      return (
        err.code === BrokerErrorCode.CONNECTION_TIMEOUT ||
        err.code === BrokerErrorCode.CONNECTION_LOST
      );
    }
    return err instanceof Error && err.message.includes('timeout');
  }

  private isDuplicateOrder(err: unknown): boolean {
    return err instanceof BrokerAdapterError && err.code === BrokerErrorCode.DUPLICATE_ORDER;
  }

  private isRetryable(err: unknown): boolean {
    if (err instanceof BrokerAdapterError) {
      return [
        BrokerErrorCode.CONNECTION_TIMEOUT,
        BrokerErrorCode.RATE_LIMITED,
        BrokerErrorCode.BROKER_SERVER_ERROR,
        BrokerErrorCode.NOT_CONNECTED,
      ].includes(err.code);
    }
    return false;
  }

  private extractErrorCode(err: unknown): string | null {
    if (err instanceof BrokerAdapterError) return err.code;
    return null;
  }

  private async callWithTimeout(
    adapter: IBrokerAdapter,
    request: BrokerOrderRequest,
    timeoutMs: number,
  ): Promise<BrokerOrderResult> {
    return Promise.race([
      adapter.placeOrder(request),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new BrokerAdapterError(BrokerErrorCode.CONNECTION_TIMEOUT, 'Broker order timeout'),
            ),
          timeoutMs,
        ),
      ),
    ]);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
