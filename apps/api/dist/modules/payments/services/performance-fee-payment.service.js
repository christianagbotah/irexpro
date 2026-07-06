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
var PerformanceFeePaymentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceFeePaymentService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const invoice_entity_1 = require("../entities/invoice.entity");
const payment_transaction_entity_1 = require("../entities/payment-transaction.entity");
const performance_fee_assessment_entity_1 = require("../../performance-fees/entities/performance-fee-assessment.entity");
const user_entity_1 = require("../../users/entities/user.entity");
const payment_routing_service_1 = require("./payment-routing.service");
const audit_service_1 = require("../../audit/audit.service");
const audit_action_enum_1 = require("../../../common/enums/audit-action.enum");
const audit_log_entity_1 = require("../../audit/entities/audit-log.entity");
const PAYABLE_INVOICE_STATUSES = new Set([
    invoice_entity_1.InvoiceStatus.ISSUED,
    invoice_entity_1.InvoiceStatus.OVERDUE,
]);
let PerformanceFeePaymentService = PerformanceFeePaymentService_1 = class PerformanceFeePaymentService {
    constructor(invoiceRepo, transactionRepo, assessmentRepo, userRepo, routingService, auditService) {
        this.invoiceRepo = invoiceRepo;
        this.transactionRepo = transactionRepo;
        this.assessmentRepo = assessmentRepo;
        this.userRepo = userRepo;
        this.routingService = routingService;
        this.auditService = auditService;
        this.logger = new common_1.Logger(PerformanceFeePaymentService_1.name);
    }
    async initiatePerformanceFeeCheckout(params) {
        const { invoiceId, requestingUserId, isAdmin, options, ipAddress } = params;
        const { invoice, assessment } = await this.loadPayableContext(invoiceId, requestingUserId, isAdmin);
        const transaction = await this.findPerformanceFeeTransaction(invoice.id);
        if (!transaction) {
            throw new common_1.BadRequestException(`No payable transaction found for invoice ${invoice.invoiceNumber}`);
        }
        if (transaction.status === payment_transaction_entity_1.PaymentTransactionStatus.SUCCEEDED) {
            throw new common_1.ConflictException('This performance-fee invoice has already been paid');
        }
        const existingReuse = this.buildReuseResult(transaction);
        if (existingReuse) {
            this.logger.log(`[PerfFeePay] Reusing in-progress ${transaction.provider} session for invoice ${invoice.id}`);
            return { ...existingReuse, invoiceNumber: invoice.invoiceNumber };
        }
        const claim = await this.transactionRepo.update({
            id: transaction.id,
            status: (0, typeorm_2.In)([payment_transaction_entity_1.PaymentTransactionStatus.PENDING, payment_transaction_entity_1.PaymentTransactionStatus.FAILED]),
        }, { status: payment_transaction_entity_1.PaymentTransactionStatus.PROCESSING });
        if (!claim.affected) {
            const current = await this.transactionRepo.findOne({ where: { id: transaction.id } });
            if (current?.status === payment_transaction_entity_1.PaymentTransactionStatus.SUCCEEDED) {
                throw new common_1.ConflictException('This performance-fee invoice has already been paid');
            }
            const reuse = current ? this.buildReuseResult(current) : null;
            if (reuse) {
                return { ...reuse, invoiceNumber: invoice.invoiceNumber };
            }
            throw new common_1.ConflictException('A checkout session is already being created for this invoice — please retry shortly');
        }
        try {
            const currency = (options?.currency ?? invoice.currency).toUpperCase();
            if (currency !== invoice.currency.toUpperCase()) {
                throw new common_1.BadRequestException(`Requested currency ${currency} does not match invoice currency ${invoice.currency}`);
            }
            const owner = await this.userRepo.findOne({ where: { id: invoice.userId } });
            if (!owner) {
                throw new common_1.NotFoundException('Invoice owner not found');
            }
            const countryCode = (options?.countryCode ?? owner.countryCode ?? '').toUpperCase();
            if (!countryCode) {
                throw new common_1.BadRequestException('A country code is required to route a payment provider for this invoice');
            }
            const { provider, reason: routingReason } = await this.routingService.routeForCheckout(countryCode, currency, options?.provider);
            let sessionResult;
            try {
                sessionResult = await provider.createCheckoutSession({
                    userId: invoice.userId,
                    email: owner.email,
                    planId: `perf-fee:${assessment.id}`,
                    currency,
                    amountMinor: this.toAmountMinor(invoice.totalAmount),
                    countryCode,
                    invoiceId: invoice.id,
                    metadata: {
                        type: 'PERFORMANCE_FEE',
                        assessmentId: assessment.id,
                        invoiceId: invoice.id,
                    },
                });
            }
            catch (err) {
                const message = err instanceof Error ? err.message : 'Checkout unavailable';
                await this.transactionRepo.update(transaction.id, {
                    provider: provider.providerId,
                    status: payment_transaction_entity_1.PaymentTransactionStatus.PENDING,
                    failureMessage: this.safeMessage(message),
                });
                await this.auditService.log({
                    actorUserId: requestingUserId,
                    actorType: isAdmin ? 'ADMIN' : 'USER',
                    action: audit_action_enum_1.AuditAction.PERFORMANCE_FEE_CHECKOUT_FAILED,
                    resourceType: 'PaymentTransaction',
                    resourceId: transaction.id,
                    ipAddress,
                    metadata: {
                        invoiceId: invoice.id,
                        assessmentId: assessment.id,
                        provider: provider.providerId,
                        currency,
                        countryCode,
                    },
                    severity: audit_log_entity_1.AuditSeverity.WARNING,
                });
                throw new common_1.BadRequestException(`Payment checkout failed: ${this.safeMessage(message)}`);
            }
            const providerReference = sessionResult.providerTransactionReference ?? sessionResult.sessionId;
            await this.transactionRepo.update(transaction.id, {
                provider: provider.providerId,
                providerTransactionReference: providerReference,
                status: payment_transaction_entity_1.PaymentTransactionStatus.PROCESSING,
                countryCode,
                failureCode: null,
                failureMessage: null,
                providerPayloadSummary: {
                    assessmentId: assessment.id,
                    invoiceId: invoice.id,
                    type: 'PERFORMANCE_FEE',
                    provider: provider.providerId,
                    sessionId: sessionResult.sessionId,
                    checkoutUrl: sessionResult.checkoutUrl,
                    routingReason,
                },
            });
            await this.auditService.log({
                actorUserId: requestingUserId,
                actorType: isAdmin ? 'ADMIN' : 'USER',
                action: audit_action_enum_1.AuditAction.PERFORMANCE_FEE_CHECKOUT_INITIATED,
                resourceType: 'PaymentTransaction',
                resourceId: transaction.id,
                ipAddress,
                metadata: {
                    invoiceId: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                    assessmentId: assessment.id,
                    provider: provider.providerId,
                    amountMinor: invoice.totalAmount,
                    currency,
                    countryCode,
                    routingReason,
                },
                severity: audit_log_entity_1.AuditSeverity.INFO,
            });
            this.logger.log(`[PerfFeePay] Checkout initiated: invoice=${invoice.id}, tx=${transaction.id}, ` +
                `provider=${provider.providerId}`);
            return {
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                transactionId: transaction.id,
                provider: provider.providerId,
                paymentStatus: payment_transaction_entity_1.PaymentTransactionStatus.PROCESSING,
                checkoutUrl: sessionResult.checkoutUrl,
                sessionId: sessionResult.sessionId,
                providerReference,
                reusedExistingSession: false,
            };
        }
        catch (err) {
            const current = await this.transactionRepo.findOne({ where: { id: transaction.id } });
            if (current?.status === payment_transaction_entity_1.PaymentTransactionStatus.PROCESSING &&
                !current.providerTransactionReference) {
                await this.transactionRepo.update(transaction.id, {
                    status: payment_transaction_entity_1.PaymentTransactionStatus.PENDING,
                });
            }
            throw err;
        }
    }
    async getInvoiceView(invoiceId, requestingUserId, isAdmin) {
        const invoice = await this.invoiceRepo.findOne({ where: { id: invoiceId } });
        if (!invoice)
            throw new common_1.NotFoundException('Invoice not found');
        this.assertOwnership(invoice, requestingUserId, isAdmin);
        this.assertPerformanceFeeInvoice(invoice);
        const assessment = await this.assessmentRepo.findOne({ where: { invoiceId: invoice.id } });
        const transaction = await this.findPerformanceFeeTransaction(invoice.id);
        return this.toInvoiceView(invoice, assessment, transaction);
    }
    async getPerformanceFeePaymentStatus(invoiceId, requestingUserId, isAdmin, ipAddress) {
        const invoice = await this.invoiceRepo.findOne({ where: { id: invoiceId } });
        if (!invoice)
            throw new common_1.NotFoundException('Invoice not found');
        this.assertOwnership(invoice, requestingUserId, isAdmin);
        this.assertPerformanceFeeInvoice(invoice);
        const assessment = await this.assessmentRepo.findOne({ where: { invoiceId: invoice.id } });
        const transaction = await this.findPerformanceFeeTransaction(invoice.id);
        await this.auditService.log({
            actorUserId: requestingUserId,
            actorType: isAdmin ? 'ADMIN' : 'USER',
            action: audit_action_enum_1.AuditAction.PERFORMANCE_FEE_PAYMENT_STATUS_VIEWED,
            resourceType: 'Invoice',
            resourceId: invoice.id,
            ipAddress,
            metadata: { invoiceId: invoice.id, assessmentId: assessment?.id ?? null },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        return this.toInvoiceView(invoice, assessment, transaction);
    }
    async listUserPerformanceFeeInvoices(userId, filters = {}) {
        const invoices = await this.invoiceRepo.find({
            where: { userId },
            order: { createdAt: 'DESC' },
            take: filters.limit ?? 100,
        });
        const perfFeeInvoices = invoices.filter((inv) => inv.metadata?.['type'] === 'PERFORMANCE_FEE' &&
            (!filters.status || inv.status === filters.status));
        const views = [];
        for (const invoice of perfFeeInvoices) {
            const assessment = await this.assessmentRepo.findOne({ where: { invoiceId: invoice.id } });
            const transaction = await this.findPerformanceFeeTransaction(invoice.id);
            views.push(this.toInvoiceView(invoice, assessment, transaction));
        }
        return views;
    }
    async loadPayableContext(invoiceId, requestingUserId, isAdmin) {
        const invoice = await this.invoiceRepo.findOne({ where: { id: invoiceId } });
        if (!invoice)
            throw new common_1.NotFoundException('Invoice not found');
        this.assertOwnership(invoice, requestingUserId, isAdmin);
        this.assertPerformanceFeeInvoice(invoice);
        if (invoice.status === invoice_entity_1.InvoiceStatus.PAID) {
            throw new common_1.ConflictException('This performance-fee invoice has already been paid');
        }
        if (!PAYABLE_INVOICE_STATUSES.has(invoice.status)) {
            throw new common_1.BadRequestException(`Invoice ${invoice.invoiceNumber} is in status ${invoice.status} and cannot be paid`);
        }
        const assessment = await this.assessmentRepo.findOne({ where: { invoiceId: invoice.id } });
        if (!assessment) {
            throw new common_1.BadRequestException('No performance-fee assessment is linked to this invoice');
        }
        if (assessment.status !== performance_fee_assessment_entity_1.AssessmentStatus.INVOICED) {
            throw new common_1.BadRequestException(`Linked assessment is in status ${assessment.status}; only INVOICED assessments can be paid`);
        }
        return { invoice, assessment };
    }
    assertOwnership(invoice, requestingUserId, isAdmin) {
        if (!isAdmin && invoice.userId !== requestingUserId) {
            throw new common_1.ForbiddenException('You can only access your own performance-fee invoices');
        }
    }
    assertPerformanceFeeInvoice(invoice) {
        const type = invoice.metadata?.['type'];
        if (type !== 'PERFORMANCE_FEE') {
            throw new common_1.BadRequestException('Invoice is not a performance-fee invoice');
        }
    }
    buildReuseResult(transaction) {
        if (transaction.status === payment_transaction_entity_1.PaymentTransactionStatus.PROCESSING &&
            transaction.provider !== 'manual' &&
            transaction.providerTransactionReference) {
            const summary = transaction.providerPayloadSummary ?? {};
            return {
                invoiceId: transaction.invoiceId ?? '',
                transactionId: transaction.id,
                provider: transaction.provider,
                paymentStatus: transaction.status,
                checkoutUrl: summary['checkoutUrl'] ?? undefined,
                sessionId: summary['sessionId'] ?? undefined,
                providerReference: transaction.providerTransactionReference,
                reusedExistingSession: true,
            };
        }
        return null;
    }
    async findPerformanceFeeTransaction(invoiceId) {
        return this.transactionRepo.findOne({
            where: { invoiceId, paymentPurpose: payment_transaction_entity_1.PaymentPurpose.PERFORMANCE_FEE },
            order: { createdAt: 'DESC' },
        });
    }
    toInvoiceView(invoice, assessment, transaction) {
        const summary = transaction?.providerPayloadSummary ?? {};
        return {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            status: invoice.status,
            currency: invoice.currency,
            totalAmount: invoice.totalAmount,
            dueDate: invoice.dueDate,
            paidAt: invoice.paidAt,
            assessmentId: assessment?.id ?? null,
            assessmentStatus: assessment?.status ?? null,
            paymentStatus: transaction?.status ?? 'NONE',
            provider: transaction?.provider ?? null,
            checkoutSessionId: summary['sessionId'] ?? null,
            manual: transaction?.provider === 'manual',
            createdAt: invoice.createdAt,
        };
    }
    toAmountMinor(minorUnits) {
        const asBig = BigInt(minorUnits);
        if (asBig > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new common_1.BadRequestException('Invoice amount exceeds the maximum supported checkout amount');
        }
        return Number(asBig);
    }
    safeMessage(message) {
        return message.slice(0, 300);
    }
};
exports.PerformanceFeePaymentService = PerformanceFeePaymentService;
exports.PerformanceFeePaymentService = PerformanceFeePaymentService = PerformanceFeePaymentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(invoice_entity_1.Invoice)),
    __param(1, (0, typeorm_1.InjectRepository)(payment_transaction_entity_1.PaymentTransaction)),
    __param(2, (0, typeorm_1.InjectRepository)(performance_fee_assessment_entity_1.PerformanceFeeAssessment)),
    __param(3, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        payment_routing_service_1.PaymentRoutingService,
        audit_service_1.AuditService])
], PerformanceFeePaymentService);
//# sourceMappingURL=performance-fee-payment.service.js.map