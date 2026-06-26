/**
 * Normalized OHLCV candle for internal market-data API responses.
 * All price fields are decimal-safe strings — never JavaScript floats.
 */
export interface NormalizedOhlcvCandle {
  timestamp: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  instrument: string;
  timeframe: string;
  source: string;
}
