import { Injectable } from '@nestjs/common';

/**
 * Currency minor-unit (ISO 4217 exponent) configuration.
 *
 * The number of fractional digits a currency uses determines how a major-unit
 * decimal string (e.g. "1000.50") maps to a minor-unit integer:
 *   - 2 digits (USD, EUR): "1000.50" -> 100050 minor units (cents)
 *   - 0 digits (JPY, KRW): "1000"    -> 1000   minor units (yen has no subunit)
 *   - 3 digits (KWD, BHD): "1.234"   -> 1234   minor units (fils)
 *
 * SAFETY: A hard-coded ×100 assumption silently corrupts the fee basis for
 * non-2-decimal currencies (e.g. JPY profit would be inflated 100×). This map
 * is the single source of truth so reconciliation either converts correctly or
 * fails closed for an unmapped currency.
 */
export const CURRENCY_MINOR_UNIT_DIGITS: Readonly<Record<string, number>> = Object.freeze({
  // ── 2-decimal currencies (the vast majority) ──────────────────────────────
  USD: 2, EUR: 2, GBP: 2, CHF: 2, CAD: 2, AUD: 2, NZD: 2,
  CNY: 2, HKD: 2, SGD: 2, INR: 2, BRL: 2, MXN: 2, PLN: 2,
  SEK: 2, NOK: 2, DKK: 2, CZK: 2, HUF: 2, TRY: 2, RUB: 2,
  ZAR: 2, NGN: 2, GHS: 2, KES: 2, EGP: 2, MAD: 2, AED: 2,
  SAR: 2, QAR: 2, THB: 2, MYR: 2, PHP: 2, IDR: 2, ILS: 2,

  // ── 0-decimal currencies (no minor subunit) ──────────────────────────────
  JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, XOF: 0, XAF: 0, UGX: 0, RWF: 0,

  // ── 3-decimal currencies ─────────────────────────────────────────────────
  KWD: 3, BHD: 3, OMR: 3, JOD: 3, TND: 3,
});

/** Returns true if the currency has a known minor-unit exponent. */
export function isSupportedCurrency(currency: string): boolean {
  if (!currency) return false;
  return Object.prototype.hasOwnProperty.call(
    CURRENCY_MINOR_UNIT_DIGITS,
    currency.toUpperCase(),
  );
}

/**
 * Returns the number of minor-unit digits for a currency.
 * Throws if the currency is not mapped — callers must fail closed rather than
 * silently assume 2 decimals.
 */
export function getMinorUnitDigits(currency: string): number {
  const code = (currency ?? '').toUpperCase();
  const digits = CURRENCY_MINOR_UNIT_DIGITS[code];
  if (digits === undefined) {
    throw new Error(`Unsupported currency minor-unit mapping: ${currency}`);
  }
  return digits;
}

/**
 * Thin injectable wrapper around the pure currency helpers, for services that
 * prefer dependency injection. The reconciliation service and normalizer use
 * the pure functions directly; this exists for future consumers.
 */
@Injectable()
export class CurrencyMinorUnitService {
  isSupported(currency: string): boolean {
    return isSupportedCurrency(currency);
  }

  getMinorUnitDigits(currency: string): number {
    return getMinorUnitDigits(currency);
  }
}
