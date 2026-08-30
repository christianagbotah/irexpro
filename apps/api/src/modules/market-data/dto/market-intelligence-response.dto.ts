export type MarketDataFreshness = 'FRESH' | 'STALE';

export interface MarketQuoteDto {
  bid: string;
  ask: string;
  spread: string;
  timestamp: string;
  freshness: MarketDataFreshness;
}

export interface MarketCandleDto {
  timestamp: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

/**
 * Frontend-safe, broker-authoritative market projection.
 *
 * Intentionally excludes connection/account/provider identifiers, credentials,
 * adapter diagnostics, and any order/execution mutation controls.
 */
export interface MarketIntelligenceResponseDto {
  instrument: string;
  timeframe: string;
  source: 'BROKER';
  status: MarketDataFreshness;
  retrievedAt: string;
  latestCandleAt: string | null;
  quote: MarketQuoteDto;
  candles: MarketCandleDto[];
}
