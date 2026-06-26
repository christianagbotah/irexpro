import { ConfigService } from '@nestjs/config';
import { AiSchedulerSessionStartPayload, AiSchedulerSessionStopPayload } from './interfaces/ai-scheduler.interface';
export declare class AiEngineClient {
    private readonly configService;
    private readonly logger;
    constructor(configService: ConfigService);
    isSchedulerIntegrationEnabled(): boolean;
    private getBaseUrl;
    private getInternalApiKey;
    notifySessionStarted(payload: AiSchedulerSessionStartPayload): Promise<void>;
    notifySessionStopped(payload: AiSchedulerSessionStopPayload): Promise<void>;
    private post;
}
