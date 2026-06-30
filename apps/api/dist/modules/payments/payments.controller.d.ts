import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { User } from '../users/entities/user.entity';
import { PaymentRoutingService } from './services/payment-routing.service';
import { WebhookProcessorService } from './services/webhook-processor.service';
export declare class PaymentsController {
    private readonly routingService;
    private readonly webhookProcessor;
    constructor(routingService: PaymentRoutingService, webhookProcessor: WebhookProcessorService);
    getProviders(countryCode?: string, currency?: string, _user?: User): Promise<import("./services/payment-routing.service").AvailableProviderDto[]>;
    handleWebhook(provider: string, req: RawBodyRequest<Request>): Promise<{
        accepted: boolean;
        idempotent: boolean;
        message: string;
        status: string;
    }>;
}
