import { Injectable, Logger } from '@nestjs/common';
import { BrokerClosedTrade } from '../../broker/interfaces/broker-adapter.interface';
import { NormalizedClosedTrade } from '../interfaces/normalized-closed-trade.interface';

/**
 * Convert a broker major-unit decimal string to a minor-unit bigint string.
 *
 * Example: "123.45"  → "12345"
 *          "-2.50"   → "-250"
 *          "0.00"    → "0"
 *          "1000"    → "100000"
 *
 * Uses string arithmetic (no floating point) so it is safe for all values
 * representable by a 64-bit integer.
 */
export function majorToMinorUnits(majorStr: string): string {
  if (!majorStr || majorStr === '' || majorStr === 'null') return '0';

  const trimmed = majorStr.trim();
  const negative = trimmed.startsWith('-');
  const abs = negative ? trimmed.slice(1) : trimmed;

  const dotIdx = abs.indexOf('.');
  let intPart: string;
  let decPart: string;

  if (dotIdx === -1) {
    intPart = abs;
    decPart = '00';
  } else {
    intPart = abs.slice(0, dotIdx);
    // Take up to 2 decimal places, pad to exactly 2
    decPart = abs.slice(dotIdx + 1, dotIdx + 3).padEnd(2, '0');
  }

  // Validate numeric-only after sign strip
  if (!/^\d*$/.test(intPart) || !/^\d{2}$/.test(decPart)) {
    return '0';
  }

  const minor = BigInt(intPart === '' ? '0' : intPart) * 100n + BigInt(decPart);
  return negative ? (-minor).toString() : minor.toString();
}

/**
 * Validate that a string represents a valid integer (possibly negative).
 * Used to guard minor-unit bigint strings.
 */
export function isValidBigIntString(value: string): boolean {
  return /^-?\d+$/.test(value.trim());
}

/**
 * ClosedTradeNormalizerService
 *
 * Converts raw BrokerClosedTrade records (from IBrokerAdapter.getClosedTrades)
 * into NormalizedClosedTrade objects ready for reconciliation processing.
 *
 * NORMALISATION RULES:
 * 1. brokerTradeId is sourced from externalOrderId — skip if missing.
 * 2. closedAt must be in the past — skip future-dated trades.
 * 3. openedAt is allowed to be null.
 * 4. Money values are converted from major-unit decimal strings to minor-unit
 *    bigint strings (×100 for 2dp currencies). No float arithmetic.
 * 5. netRealisedPnl = grossRealisedPnl + commission + swap.
 *    Do NOT subtract commission/swap a second time when using netRealisedPnl.
 * 6. rawMetadataSummary must NOT include credentials, server URLs, API keys,
 *    account secrets, or full raw broker payloads.
 * 7. Open trades (closedAt missing) are skipped.
 * 8. Trades with invalid numeric P&L are skipped.
 */
@Injectable()
export class ClosedTradeNormalizerService {
  private readonly logger = new Logger(ClosedTradeNormalizerService.name);

  /**
   * Normalize a batch of raw BrokerClosedTrade records.
   * Returns only valid, fully-normalised trades. Invalid trades are logged and skipped.
   *
   * @param rawTrades  Raw trades from IBrokerAdapter.getClosedTrades()
   * @param brokerProvider  Broker identifier string (e.g. "metatrader5")
   * @param now  Current timestamp used for future-closedAt guard
   */
  normalize(
    rawTrades: BrokerClosedTrade[],
    brokerProvider: string,
    now: Date = new Date(),
  ): { valid: NormalizedClosedTrade[]; skipped: SkippedTrade[] } {
    const valid: NormalizedClosedTrade[] = [];
    const skipped: SkippedTrade[] = [];

    for (const raw of rawTrades) {
      const result = this.normalizeOne(raw, brokerProvider, now);
      if (result.kind === 'valid') {
        valid.push(result.trade);
      } else {
        skipped.push(result);
        this.logger.debug(
          `[Normalizer] Skipped trade externalOrderId=${raw.externalOrderId ?? '<none>'}: ${result.reason}`,
        );
      }
    }

    return { valid, skipped };
  }

  private normalizeOne(
    raw: BrokerClosedTrade,
    brokerProvider: string,
    now: Date,
  ): ({ kind: 'valid'; trade: NormalizedClosedTrade } | SkippedTrade) {
    // 1. brokerTradeId must be non-empty
    const brokerTradeId = raw.externalOrderId?.trim();
    if (!brokerTradeId) {
      return { kind: 'skipped', externalOrderId: null, reason: 'missing brokerTradeId (externalOrderId)' };
    }

    // 2. closedAt must exist and be in the past
    if (!raw.closedAt) {
      return { kind: 'skipped', externalOrderId: brokerTradeId, reason: 'missing closedAt (open trade)' };
    }
    if (raw.closedAt > now) {
      return {
        kind: 'skipped',
        externalOrderId: brokerTradeId,
        reason: `future closedAt (${raw.closedAt.toISOString()})`,
      };
    }

    // 3. Convert money to minor units
    const grossRealisedPnl = majorToMinorUnits(raw.realisedPnl ?? '0');
    const commission = majorToMinorUnits(raw.commission ?? '0');
    const swap = majorToMinorUnits(raw.swap ?? '0');

    if (!isValidBigIntString(grossRealisedPnl)) {
      return { kind: 'skipped', externalOrderId: brokerTradeId, reason: 'invalid grossRealisedPnl' };
    }
    if (!isValidBigIntString(commission)) {
      return { kind: 'skipped', externalOrderId: brokerTradeId, reason: 'invalid commission' };
    }
    if (!isValidBigIntString(swap)) {
      return { kind: 'skipped', externalOrderId: brokerTradeId, reason: 'invalid swap' };
    }

    // 4. Compute net realised P&L (no double-subtraction)
    //    netRealisedPnl = grossRealisedPnl + commission + swap
    const netRealisedPnl = (
      BigInt(grossRealisedPnl) + BigInt(commission) + BigInt(swap)
    ).toString();

    // 5. Validate direction
    if (raw.direction !== 'BUY' && raw.direction !== 'SELL') {
      return { kind: 'skipped', externalOrderId: brokerTradeId, reason: `invalid direction: ${raw.direction}` };
    }

    // 6. Validate instrument
    if (!raw.instrument?.trim()) {
      return { kind: 'skipped', externalOrderId: brokerTradeId, reason: 'missing instrument' };
    }

    // Safe metadata summary — no credentials, server URLs, or secrets
    const rawMetadataSummary: Record<string, unknown> = {
      brokerProvider,
      instrument: raw.instrument,
      direction: raw.direction,
      lotSize: raw.lotSize,
      closeReason: raw.closeReason,
      openedAt: raw.openedAt?.toISOString() ?? null,
      closedAt: raw.closedAt.toISOString(),
    };

    return {
      kind: 'valid',
      trade: {
        brokerTradeId,
        brokerOrderId: null, // BrokerClosedTrade uses single externalOrderId; no separate order ID
        instrument: raw.instrument.trim(),
        direction: raw.direction,
        volume: raw.lotSize ?? '0',
        openedAt: raw.openedAt ?? null,
        closedAt: raw.closedAt,
        entryPrice: raw.openPrice ?? null,
        exitPrice: raw.closePrice ?? null,
        grossRealisedPnl,
        commission,
        swap,
        netRealisedPnl,
        currency: 'USD', // Currency is resolved from the BrokerConnection.accountCurrency at service layer
        rawMetadataSummary,
      },
    };
  }
}

export interface SkippedTrade {
  kind: 'skipped';
  externalOrderId: string | null;
  reason: string;
}
