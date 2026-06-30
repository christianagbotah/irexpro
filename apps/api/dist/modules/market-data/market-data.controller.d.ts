import { MarketDataService } from './market-data.service';
import { InternalOhlcvQueryDto } from './dto/internal-ohlcv-query.dto';
import { InternalOhlcvResponseDto } from './dto/internal-ohlcv-response.dto';
export declare class MarketDataController {
    private readonly marketDataService;
    constructor(marketDataService: MarketDataService);
    getInternalOhlcv(query: InternalOhlcvQueryDto): Promise<InternalOhlcvResponseDto>;
}
