import { ConfigService } from '@nestjs/config';
import { AiSignalService } from './ai-signal.service';
import { SimulateSignalDto } from './dto/simulate-signal.dto';
import { InternalSignalDto } from './dto/internal-signal.dto';
import { StrategyResult } from '../strategy/interfaces/strategy.interface';
export declare class AiController {
    private readonly aiSignalService;
    private readonly configService;
    private readonly logger;
    constructor(aiSignalService: AiSignalService, configService: ConfigService);
    simulateSignal(req: {
        user: {
            id: string;
        };
    }, dto: SimulateSignalDto): Promise<StrategyResult>;
    receiveInternalSignal(dto: InternalSignalDto): Promise<StrategyResult>;
}
