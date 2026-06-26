import { NormalizedOhlcvCandle } from '../interfaces/ohlcv-candle.interface';

export class InternalOhlcvResponseDto {
  instrument: string;
  timeframe: string;
  source: string;
  count: number;
  candles: NormalizedOhlcvCandle[];
}
