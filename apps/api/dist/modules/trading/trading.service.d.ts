import { BrokerService } from '../broker/broker.service';
export declare class TradingService {
    private readonly brokerService;
    private readonly logger;
    constructor(brokerService: BrokerService);
    assertBrokerGate(userId: string): Promise<void>;
    startTradingSession(_userId: string): Promise<never>;
    stopTradingSession(_userId: string): Promise<never>;
}
