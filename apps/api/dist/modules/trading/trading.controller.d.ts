import { TradingService } from './trading.service';
import { TradingSession } from '../execution/entities/trading-session.entity';
import { StartSessionDto } from './dto/start-session.dto';
export declare class TradingController {
    private readonly tradingService;
    private readonly logger;
    constructor(tradingService: TradingService);
    startSession(req: {
        user: {
            id: string;
        };
    }, dto: StartSessionDto): Promise<TradingSession>;
    stopSession(req: {
        user: {
            id: string;
        };
    }, sessionId: string): Promise<{
        message: string;
        sessionId: string;
    }>;
    getActive(req: {
        user: {
            id: string;
        };
    }): Promise<TradingSession | null>;
    getById(req: {
        user: {
            id: string;
        };
    }, sessionId: string): Promise<TradingSession>;
}
