import { BrokerClosedTrade } from '../../broker/interfaces/broker-adapter.interface';
import { NormalizedClosedTrade } from '../interfaces/normalized-closed-trade.interface';
export declare function majorToMinorUnits(majorStr: string): string;
export declare function isValidBigIntString(value: string): boolean;
export declare class ClosedTradeNormalizerService {
    private readonly logger;
    normalize(rawTrades: BrokerClosedTrade[], brokerProvider: string, now?: Date): {
        valid: NormalizedClosedTrade[];
        skipped: SkippedTrade[];
    };
    private normalizeOne;
}
export interface SkippedTrade {
    kind: 'skipped';
    externalOrderId: string | null;
    reason: string;
}
