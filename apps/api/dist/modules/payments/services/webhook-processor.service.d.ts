import { Repository } from 'typeorm';
import { PaymentWebhookEvent } from '../entities/payment-webhook-event.entity';
import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { Invoice } from '../entities/invoice.entity';
import { PaymentProviderRegistry } from '../registry/payment-provider.registry';
import { AuditService } from '../../audit/audit.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
export interface WebhookProcessResult {
    accepted: boolean;
    idempotent: boolean;
    message: string;
}
export declare class WebhookProcessorService {
    private readonly registry;
    private readonly subscriptionsService;
    private readonly auditService;
    private readonly webhookEventRepo;
    private readonly transactionRepo;
    private readonly invoiceRepo;
    private readonly logger;
    constructor(registry: PaymentProviderRegistry, subscriptionsService: SubscriptionsService, auditService: AuditService, webhookEventRepo: Repository<PaymentWebhookEvent>, transactionRepo: Repository<PaymentTransaction>, invoiceRepo: Repository<Invoice>);
    processWebhook(providerId: string, rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<WebhookProcessResult>;
    private handleEvent;
    private handlePaymentSucceeded;
    private handlePaymentFailed;
    private handleSubscriptionCancelled;
}
