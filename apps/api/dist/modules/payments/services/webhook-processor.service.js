"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var WebhookProcessorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookProcessorService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const payment_webhook_event_entity_1 = require("../entities/payment-webhook-event.entity");
const payment_transaction_entity_1 = require("../entities/payment-transaction.entity");
const invoice_entity_1 = require("../entities/invoice.entity");
const payment_provider_registry_1 = require("../registry/payment-provider.registry");
const payment_provider_interface_1 = require("../interfaces/payment-provider.interface");
const audit_service_1 = require("../../audit/audit.service");
const audit_action_enum_1 = require("../../../common/enums/audit-action.enum");
const audit_log_entity_1 = require("../../audit/entities/audit-log.entity");
const subscriptions_service_1 = require("../../subscriptions/subscriptions.service");
let WebhookProcessorService = WebhookProcessorService_1 = class WebhookProcessorService {
    constructor(registry, subscriptionsService, auditService, webhookEventRepo, transactionRepo, invoiceRepo) {
        this.registry = registry;
        this.subscriptionsService = subscriptionsService;
        this.auditService = auditService;
        this.webhookEventRepo = webhookEventRepo;
        this.transactionRepo = transactionRepo;
        this.invoiceRepo = invoiceRepo;
        this.logger = new common_1.Logger(WebhookProcessorService_1.name);
    }
    async processWebhook(providerId, rawBody, headers) {
        if (providerId === 'manual') {
            throw new common_1.BadRequestException('Unknown payment provider');
        }
        const provider = this.registry.getProvider(providerId);
        const signatureVerified = provider.verifyWebhookSignature(rawBody, headers);
        await this.auditService.log({
            actorUserId: 'system',
            actorType: 'SYSTEM',
            action: audit_action_enum_1.AuditAction.PAYMENT_WEBHOOK_RECEIVED,
            resourceType: 'PaymentWebhookEvent',
            resourceId: providerId,
            metadata: { provider: providerId, signatureVerified },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        if (!signatureVerified) {
            await this.auditService.log({
                actorUserId: 'system',
                actorType: 'SYSTEM',
                action: audit_action_enum_1.AuditAction.PAYMENT_WEBHOOK_SIGNATURE_FAILED,
                resourceType: 'PaymentWebhookEvent',
                resourceId: providerId,
                metadata: { provider: providerId },
                severity: audit_log_entity_1.AuditSeverity.WARNING,
            });
            throw new common_1.BadRequestException('Webhook signature verification failed');
        }
        const event = provider.parseWebhookEvent(rawBody, headers);
        const payloadSummary = {
            eventType: event.eventType,
            providerEventId: event.providerEventId,
            providerSubscriptionId: event.providerSubscriptionId,
            amountMinor: event.amountMinor,
            currency: event.currency,
        };
        let webhookRecord;
        try {
            webhookRecord = this.webhookEventRepo.create({
                provider: providerId,
                providerEventId: event.providerEventId,
                eventType: event.eventType,
                signatureVerified: true,
                processed: false,
                payloadSummary,
                receivedAt: new Date(),
            });
            webhookRecord = await this.webhookEventRepo.save(webhookRecord);
        }
        catch (err) {
            if (err instanceof typeorm_2.QueryFailedError && err.code === '23505') {
                this.logger.log(`[Webhook] Idempotent: event ${event.providerEventId} already received from ${providerId}`);
                return { accepted: true, idempotent: true, message: 'Already processed' };
            }
            throw err;
        }
        try {
            await this.handleEvent(event, webhookRecord, providerId);
            await this.webhookEventRepo.update(webhookRecord.id, {
                processed: true,
                processedAt: new Date(),
            });
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Processing error';
            await this.webhookEventRepo.update(webhookRecord.id, {
                processingError: errorMessage,
            });
            this.logger.error(`[Webhook] Processing failed for event ${event.providerEventId}: ${errorMessage}`);
            return { accepted: true, idempotent: false, message: 'Received but processing failed' };
        }
        return { accepted: true, idempotent: false, message: 'Processed' };
    }
    async handleEvent(event, webhookRecord, providerId) {
        switch (event.eventType) {
            case payment_provider_interface_1.PaymentEventType.PAYMENT_SUCCEEDED:
                await this.handlePaymentSucceeded(event, providerId);
                break;
            case payment_provider_interface_1.PaymentEventType.PAYMENT_FAILED:
                await this.handlePaymentFailed(event, providerId);
                break;
            case payment_provider_interface_1.PaymentEventType.SUBSCRIPTION_CANCELLED:
                await this.handleSubscriptionCancelled(event, providerId);
                break;
            case payment_provider_interface_1.PaymentEventType.SUBSCRIPTION_RENEWED:
                await this.handlePaymentSucceeded(event, providerId);
                break;
            default:
                this.logger.log(`[Webhook] Unhandled event type: ${event.eventType} from ${providerId}`);
        }
    }
    async handlePaymentSucceeded(event, providerId) {
        const transaction = event.providerTransactionReference
            ? await this.transactionRepo.findOne({
                where: { providerTransactionReference: event.providerTransactionReference, provider: providerId },
            })
            : null;
        if (transaction) {
            await this.transactionRepo.update(transaction.id, {
                status: payment_transaction_entity_1.PaymentTransactionStatus.SUCCEEDED,
                providerPayloadSummary: {
                    ...(transaction.providerPayloadSummary ?? {}),
                    succeededAt: new Date().toISOString(),
                    providerEventId: event.providerEventId,
                },
            });
            await this.auditService.log({
                actorUserId: transaction.userId,
                actorType: 'SYSTEM',
                action: audit_action_enum_1.AuditAction.PAYMENT_SUCCEEDED,
                resourceType: 'PaymentTransaction',
                resourceId: transaction.id,
                metadata: { provider: providerId, amountMinor: event.amountMinor, currency: event.currency },
                severity: audit_log_entity_1.AuditSeverity.INFO,
            });
            if (transaction.invoiceId) {
                await this.invoiceRepo.update(transaction.invoiceId, {
                    status: invoice_entity_1.InvoiceStatus.PAID,
                    paidAt: new Date(),
                });
                await this.auditService.log({
                    actorUserId: transaction.userId,
                    actorType: 'SYSTEM',
                    action: audit_action_enum_1.AuditAction.INVOICE_PAID,
                    resourceType: 'Invoice',
                    resourceId: transaction.invoiceId,
                    metadata: { provider: providerId, transactionId: transaction.id },
                    severity: audit_log_entity_1.AuditSeverity.INFO,
                });
            }
            const now = new Date();
            const periodEnd = new Date(now);
            periodEnd.setMonth(periodEnd.getMonth() + 1);
            const planId = transaction.providerPayloadSummary?.planId ?? null;
            const subscription = await this.subscriptionsService.activateSubscriptionFromPayment(transaction.userId, planId, providerId, event.providerSubscriptionId ?? null, now, periodEnd);
            await this.auditService.log({
                actorUserId: transaction.userId,
                actorType: 'SYSTEM',
                action: audit_action_enum_1.AuditAction.SUBSCRIPTION_ACTIVATED,
                resourceType: 'UserSubscription',
                resourceId: subscription.id,
                metadata: {
                    provider: providerId,
                    transactionId: transaction.id,
                    periodEnd: periodEnd.toISOString(),
                },
                severity: audit_log_entity_1.AuditSeverity.INFO,
            });
        }
        else {
            this.logger.warn(`[Webhook] Payment succeeded but no matching transaction found: ref=${event.providerTransactionReference}, provider=${providerId}`);
        }
    }
    async handlePaymentFailed(event, providerId) {
        const transaction = event.providerTransactionReference
            ? await this.transactionRepo.findOne({
                where: { providerTransactionReference: event.providerTransactionReference, provider: providerId },
            })
            : null;
        if (transaction) {
            await this.transactionRepo.update(transaction.id, {
                status: payment_transaction_entity_1.PaymentTransactionStatus.FAILED,
                failureMessage: 'Payment failed — see provider portal for details',
            });
            await this.auditService.log({
                actorUserId: transaction.userId,
                actorType: 'SYSTEM',
                action: audit_action_enum_1.AuditAction.PAYMENT_FAILED,
                resourceType: 'PaymentTransaction',
                resourceId: transaction.id,
                metadata: { provider: providerId },
                severity: audit_log_entity_1.AuditSeverity.WARNING,
            });
        }
    }
    async handleSubscriptionCancelled(event, providerId) {
        this.logger.log(`[Webhook] Subscription cancelled by provider ${providerId}: event=${event.providerEventId}`);
    }
};
exports.WebhookProcessorService = WebhookProcessorService;
exports.WebhookProcessorService = WebhookProcessorService = WebhookProcessorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, typeorm_1.InjectRepository)(payment_webhook_event_entity_1.PaymentWebhookEvent)),
    __param(4, (0, typeorm_1.InjectRepository)(payment_transaction_entity_1.PaymentTransaction)),
    __param(5, (0, typeorm_1.InjectRepository)(invoice_entity_1.Invoice)),
    __metadata("design:paramtypes", [payment_provider_registry_1.PaymentProviderRegistry,
        subscriptions_service_1.SubscriptionsService,
        audit_service_1.AuditService,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], WebhookProcessorService);
//# sourceMappingURL=webhook-processor.service.js.map