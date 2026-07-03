import { IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * Body for POST /api/v1/performance-fees/invoices/:invoiceId/checkout
 *
 * All fields are optional — the service falls back to the invoice currency and
 * the invoice owner's country when not provided. The `manual` provider can never
 * be selected here (public checkout routing excludes it).
 */
export class InitiatePerformanceFeeCheckoutDto {
  /** Preferred payment provider id (e.g. 'stripe', 'paystack'). Must be a routable, non-manual provider. */
  @IsOptional()
  @IsString()
  @Length(2, 50)
  provider?: string;

  /** ISO 3166-1 alpha-2 country code used for provider routing. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'countryCode must be a 2-letter ISO country code' })
  countryCode?: string;

  /** ISO 4217 currency. Must match the invoice currency when provided. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currency must be a 3-letter ISO currency code' })
  currency?: string;
}
