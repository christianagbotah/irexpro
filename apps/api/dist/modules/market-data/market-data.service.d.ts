import { BrokerService } from '../broker/broker.service';
import { AuditService } from '../audit/audit.service';
import { InternalOhlcvQueryDto } from './dto/internal-ohlcv-query.dto';
import { InternalOhlcvResponseDto } from './dto/internal-ohlcv-response.dto';
export declare class MarketDataService {
    private readonly brokerService;
    private readonly auditService;
    private readonly logger;
    constructor(brokerService: BrokerService, auditService: AuditService);
    getInternalOhlcv(query: InternalOhlcvQueryDto): Promise<InternalOhlcvResponseDto>;
    private normalizeCandle;
}
