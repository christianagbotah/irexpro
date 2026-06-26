import { NormalizedOhlcvCandle } from '../interfaces/ohlcv-candle.interface';
export declare class InternalOhlcvResponseDto {
    instrument: string;
    timeframe: string;
    source: string;
    count: number;
    candles: NormalizedOhlcvCandle[];
}
