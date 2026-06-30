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
var PerformanceFeeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceFeeService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const performance_fee_policy_entity_1 = require("../entities/performance-fee-policy.entity");
const trading_account_performance_entity_1 = require("../entities/trading-account-performance.entity");
const performance_fee_assessment_entity_1 = require("../entities/performance-fee-assessment.entity");
const performance_fee_ledger_entry_entity_1 = require("../entities/performance-fee-ledger-entry.entity");
const invoice_entity_1 = require("../../payments/entities/invoice.entity");
const payment_transaction_entity_1 = require("../../payments/entities/payment-transaction.entity");
const user_subscription_entity_1 = require("../../subscriptions/entities/user-subscription.entity");
const audit_service_1 = require("../../audit/audit.service");
const audit_action_enum_1 = require("../../../common/enums/audit-action.enum");
const audit_log_entity_1 = require("../../audit/entities/audit-log.entity");
function computeFeeAmount(profitMinorUnits, feePercent) {
    const profit = BigInt(profitMinorUnits);
    if (profit <= 0n)
        return '0';
    const feePercentScaled = BigInt(Math.round(parseFloat(feePercent) * 10000));
    const fee = (profit * feePercentScaled) / 1000000n;
    return fee.toString();
}
let PerformanceFeeService = PerformanceFeeService_1 = class PerformanceFeeService {
    constructor(policyRepo, performanceRepo, assessmentRepo, ledgerRepo, invoiceRepo, transactionRepo, subscriptionRepo, auditService) {
        this.policyRepo = policyRepo;
        this.performanceRepo = performanceRepo;
        this.assessmentRepo = assessmentRepo;
        this.ledgerRepo = ledgerRepo;
        this.invoiceRepo = invoiceRepo;
        this.transactionRepo = transactionRepo;
        this.subscriptionRepo = subscriptionRepo;
        this.auditService = auditService;
        this.logger = new common_1.Logger(PerformanceFeeService_1.name);
    }
    async getPolicies() {
        return this.policyRepo.find({ where: { isActive: true }, order: { createdAt: 'ASC' } });
    }
    async createPolicy(dto, adminId, ipAddress) {
        const policy = this.policyRepo.create({
            planId: dto.planId ?? null,
            name: dto.name,
            feePercent: dto.feePercent.toString(),
            billingFrequency: dto.billingFrequency,
        });
        const saved = await this.policyRepo.save(policy);
        await this.auditService.log({
            actorUserId: adminId,
            actorType: 'ADMIN',
            action: audit_action_enum_1.AuditAction.PERFORMANCE_FEE_POLICY_CREATED,
            resourceType: 'PerformanceFeePolicy',
            resourceId: saved.id,
            ipAddress,
            metadata: { name: dto.name, feePercent: dto.feePercent, billingFrequency: dto.billingFrequency, planId: dto.planId ?? null },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        return saved;
    }
    async getUserSummary(userId) {
        const [performance, assessments] = await Promise.all([
            this.performanceRepo.findOne({ where: { userId } }),
            this.assessmentRepo.find({
                where: { userId },
                order: { periodStart: 'DESC' },
                take: 20,
            }),
        ]);
        return { performance, assessments };
    }
    async getAssessments(userId) {
        const where = userId ? { userId } : {};
        return this.assessmentRepo.find({ where, order: { createdAt: 'DESC' }, take: 100 });
    }
    async calculateAssessment(userId, brokerConnectionId, currency, periodStart, periodEnd, adminId, ipAddress) {
        const subscription = await this.subscriptionRepo.findOne({
            where: { userId, status: user_subscription_entity_1.SubscriptionStatus.ACTIVE },
            relations: ['plan'],
            order: { createdAt: 'DESC' },
        });
        if (!subscription) {
            throw new common_1.BadRequestException('User has no active subscription — cannot assess performance fee');
        }
        const policy = await this.findApplicablePolicy(subscription.subscriptionPlanId);
        if (!policy) {
            throw new common_1.BadRequestException('No active performance fee policy found for user subscription plan');
        }
        const existing = await this.findExistingAssessment(userId, brokerConnectionId, periodStart, periodEnd);
        if (existing) {
            if (existing.status === performance_fee_assessment_entity_1.AssessmentStatus.DRAFT) {
                this.logger.log(`[PerfFee] Returning existing DRAFT assessment ${existing.id} for user ${userId}`);
                return existing;
            }
            throw new common_1.ConflictException(`An assessment in status ${existing.status} already exists for this user/broker/period`);
        }
        const outstanding = await this.findOutstandingAssessment(userId, brokerConnectionId);
        if (outstanding) {
            throw new common_1.ConflictException(`An outstanding ${outstanding.status} assessment (${outstanding.id}) must be resolved ` +
                `(paid, waived, or cancelled) before calculating a new assessment for this account`);
        }
        const performance = await this.getOrCreatePerformance(userId, brokerConnectionId, currency);
        const ledgerEntries = await this.ledgerRepo.find({
            where: {
                userId,
                brokerConnectionId: this.brokerScope(brokerConnectionId),
                occurredAt: (0, typeorm_2.Between)(periodStart, periodEnd),
            },
            order: { occurredAt: 'ASC' },
        });
        let periodRealisedPnL = 0n;
        let depositsExcluded = 0n;
        let withdrawalsAdjusted = 0n;
        for (const entry of ledgerEntries) {
            const amount = BigInt(entry.amount);
            if (entry.entryType === performance_fee_ledger_entry_entity_1.LedgerEntryType.REALISED_TRADE_PROFIT) {
                periodRealisedPnL += amount;
            }
            else if (entry.entryType === performance_fee_ledger_entry_entity_1.LedgerEntryType.REALISED_TRADE_LOSS) {
                periodRealisedPnL += amount;
            }
            else if (entry.entryType === performance_fee_ledger_entry_entity_1.LedgerEntryType.DEPOSIT) {
                depositsExcluded += amount;
            }
            else if (entry.entryType === performance_fee_ledger_entry_entity_1.LedgerEntryType.WITHDRAWAL) {
                withdrawalsAdjusted += amount;
            }
        }
        const currentTotalRealised = BigInt(performance.totalRealisedProfit) + periodRealisedPnL;
        const startingHWM = BigInt(performance.currentHighWaterMark);
        const profitAboveHWM = currentTotalRealised - startingHWM;
        const realisedProfitForFee = profitAboveHWM > 0n ? profitAboveHWM : 0n;
        const feeAmount = realisedProfitForFee > 0n
            ? computeFeeAmount(realisedProfitForFee.toString(), policy.feePercent)
            : '0';
        const status = BigInt(feeAmount) > 0n ? performance_fee_assessment_entity_1.AssessmentStatus.ASSESSED : performance_fee_assessment_entity_1.AssessmentStatus.DRAFT;
        const assessment = this.assessmentRepo.create({
            userId,
            brokerConnectionId,
            subscriptionId: subscription.id,
            invoiceId: null,
            currency,
            periodStart,
            periodEnd,
            startingHighWaterMark: startingHWM.toString(),
            endingRealisedBalance: currentTotalRealised.toString(),
            depositsExcluded: depositsExcluded.toString(),
            withdrawalsAdjusted: withdrawalsAdjusted.toString(),
            realisedProfitForFee: realisedProfitForFee.toString(),
            feePercent: policy.feePercent,
            feeAmount,
            status,
            calculationMetadata: {
                policyId: policy.id,
                policyName: policy.name,
                billingFrequency: policy.billingFrequency,
                calculationMode: policy.calculationMode,
                periodLedgerEntryCount: ledgerEntries.length,
                periodRealisedPnL: periodRealisedPnL.toString(),
                calculatedAt: new Date().toISOString(),
            },
        });
        const saved = await this.assessmentRepo.save(assessment);
        await this.performanceRepo.update(performance.id, {
            totalRealisedProfit: currentTotalRealised.toString(),
            lastRealisedBalance: currentTotalRealised.toString(),
            lastCalculationAt: new Date(),
        });
        await this.auditService.log({
            actorUserId: adminId,
            actorType: 'ADMIN',
            action: audit_action_enum_1.AuditAction.PERFORMANCE_FEE_ASSESSMENT_CALCULATED,
            resourceType: 'PerformanceFeeAssessment',
            resourceId: saved.id,
            ipAddress,
            metadata: {
                targetUserId: userId,
                brokerConnectionId,
                currency,
                periodStart: periodStart.toISOString(),
                periodEnd: periodEnd.toISOString(),
                startingHWM: startingHWM.toString(),
                realisedProfitForFee: realisedProfitForFee.toString(),
                feePercent: policy.feePercent,
                feeAmount,
                status,
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        this.logger.log(`[PerfFee] Assessment ${saved.id} calculated for user ${userId}: feeAmount=${feeAmount}, status=${status}`);
        return saved;
    }
    async invoiceAssessment(assessmentId, adminId, ipAddress) {
        const assessment = await this.assessmentRepo.findOne({ where: { id: assessmentId } });
        if (!assessment)
            throw new common_1.NotFoundException('Assessment not found');
        if (assessment.status !== performance_fee_assessment_entity_1.AssessmentStatus.ASSESSED) {
            throw new common_1.BadRequestException(`Assessment status is ${assessment.status}; only ASSESSED assessments can be invoiced`);
        }
        if (BigInt(assessment.feeAmount) <= 0n) {
            throw new common_1.BadRequestException('Cannot invoice an assessment with zero fee amount');
        }
        const invoiceNumber = `PF-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        const invoice = this.invoiceRepo.create({
            userId: assessment.userId,
            subscriptionId: assessment.subscriptionId,
            invoiceNumber,
            status: invoice_entity_1.InvoiceStatus.ISSUED,
            currency: assessment.currency,
            subtotalAmount: assessment.feeAmount,
            taxAmount: '0',
            totalAmount: assessment.feeAmount,
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            metadata: {
                type: 'PERFORMANCE_FEE',
                assessmentId: assessment.id,
                periodStart: assessment.periodStart.toISOString(),
                periodEnd: assessment.periodEnd.toISOString(),
                realisedProfitForFee: assessment.realisedProfitForFee,
                feePercent: assessment.feePercent,
            },
        });
        const savedInvoice = await this.invoiceRepo.save(invoice);
        const transaction = this.transactionRepo.create({
            userId: assessment.userId,
            subscriptionId: assessment.subscriptionId,
            invoiceId: savedInvoice.id,
            provider: 'manual',
            paymentPurpose: payment_transaction_entity_1.PaymentPurpose.PERFORMANCE_FEE,
            status: payment_transaction_entity_1.PaymentTransactionStatus.PENDING,
            currency: assessment.currency,
            amountMinor: assessment.feeAmount,
            countryCode: null,
            providerPayloadSummary: {
                assessmentId: assessment.id,
                invoiceId: savedInvoice.id,
                type: 'PERFORMANCE_FEE',
            },
        });
        await this.transactionRepo.save(transaction);
        assessment.invoiceId = savedInvoice.id;
        assessment.status = performance_fee_assessment_entity_1.AssessmentStatus.INVOICED;
        const updatedAssessment = await this.assessmentRepo.save(assessment);
        await this.ledgerRepo.save({
            userId: assessment.userId,
            assessmentId: assessment.id,
            brokerConnectionId: assessment.brokerConnectionId,
            entryType: performance_fee_ledger_entry_entity_1.LedgerEntryType.FEE_ASSESSED,
            currency: assessment.currency,
            amount: `-${assessment.feeAmount}`,
            sourceReference: assessment.id,
            occurredAt: new Date(),
            metadata: { invoiceId: savedInvoice.id, invoiceNumber },
        });
        await this.auditService.log({
            actorUserId: adminId,
            actorType: 'ADMIN',
            action: audit_action_enum_1.AuditAction.PERFORMANCE_FEE_ASSESSMENT_INVOICED,
            resourceType: 'PerformanceFeeAssessment',
            resourceId: assessment.id,
            ipAddress,
            metadata: {
                targetUserId: assessment.userId,
                invoiceId: savedInvoice.id,
                invoiceNumber,
                feeAmount: assessment.feeAmount,
                currency: assessment.currency,
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        await this.auditService.log({
            actorUserId: adminId,
            actorType: 'ADMIN',
            action: audit_action_enum_1.AuditAction.INVOICE_CREATED,
            resourceType: 'Invoice',
            resourceId: savedInvoice.id,
            ipAddress,
            metadata: {
                targetUserId: assessment.userId,
                type: 'PERFORMANCE_FEE',
                assessmentId: assessment.id,
                totalAmount: assessment.feeAmount,
                currency: assessment.currency,
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        this.logger.log(`[PerfFee] Assessment ${assessmentId} invoiced: invoice=${savedInvoice.id}`);
        return updatedAssessment;
    }
    async markAssessmentPaid(invoiceId) {
        const assessment = await this.assessmentRepo.findOne({ where: { invoiceId } });
        if (!assessment) {
            this.logger.warn(`[PerfFee] No assessment found for invoiceId=${invoiceId}`);
            return;
        }
        if (assessment.status === performance_fee_assessment_entity_1.AssessmentStatus.PAID) {
            this.logger.log(`[PerfFee] Assessment ${assessment.id} already PAID — idempotent`);
            return;
        }
        if (assessment.status !== performance_fee_assessment_entity_1.AssessmentStatus.INVOICED) {
            this.logger.warn(`[PerfFee] Cannot mark assessment ${assessment.id} PAID — status is ${assessment.status}`);
            return;
        }
        await this.assessmentRepo.update(assessment.id, { status: performance_fee_assessment_entity_1.AssessmentStatus.PAID });
        const performance = await this.performanceRepo.findOne({
            where: { userId: assessment.userId, brokerConnectionId: this.brokerScope(assessment.brokerConnectionId) },
        });
        if (performance) {
            const newHWM = assessment.endingRealisedBalance;
            const oldHWM = performance.currentHighWaterMark;
            const newTotalFees = (BigInt(performance.totalFeesCharged) + BigInt(assessment.feeAmount)).toString();
            await this.performanceRepo.update(performance.id, {
                currentHighWaterMark: newHWM,
                totalFeesCharged: newTotalFees,
            });
            await this.auditService.log({
                actorUserId: 'system',
                actorType: 'SYSTEM',
                action: audit_action_enum_1.AuditAction.HIGH_WATER_MARK_UPDATED,
                resourceType: 'TradingAccountPerformance',
                resourceId: performance.id,
                metadata: {
                    userId: assessment.userId,
                    oldHWM,
                    newHWM,
                    assessmentId: assessment.id,
                },
                severity: audit_log_entity_1.AuditSeverity.INFO,
            });
        }
        await this.auditService.log({
            actorUserId: 'system',
            actorType: 'SYSTEM',
            action: audit_action_enum_1.AuditAction.PERFORMANCE_FEE_PAID,
            resourceType: 'PerformanceFeeAssessment',
            resourceId: assessment.id,
            metadata: {
                userId: assessment.userId,
                invoiceId,
                feeAmount: assessment.feeAmount,
                currency: assessment.currency,
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        this.logger.log(`[PerfFee] Assessment ${assessment.id} marked PAID, HWM updated`);
    }
    async recordLedgerEntry(dto, adminId, ipAddress) {
        const entry = this.ledgerRepo.create({
            userId: dto.userId,
            assessmentId: dto.assessmentId ?? null,
            brokerConnectionId: dto.brokerConnectionId ?? null,
            entryType: dto.entryType,
            currency: dto.currency,
            amount: dto.amount,
            sourceReference: dto.sourceReference ?? null,
            occurredAt: new Date(dto.occurredAt),
            metadata: null,
        });
        const saved = await this.ledgerRepo.save(entry);
        await this.auditService.log({
            actorUserId: adminId,
            actorType: 'ADMIN',
            action: audit_action_enum_1.AuditAction.PERFORMANCE_FEE_LEDGER_ENTRY_CREATED,
            resourceType: 'PerformanceFeeLedgerEntry',
            resourceId: saved.id,
            ipAddress,
            metadata: {
                targetUserId: dto.userId,
                entryType: dto.entryType,
                currency: dto.currency,
                amount: dto.amount,
                brokerConnectionId: dto.brokerConnectionId ?? null,
                occurredAt: dto.occurredAt,
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        return saved;
    }
    async getCurrentHighWaterMark(userId, brokerConnectionId, currency) {
        const performance = await this.performanceRepo.findOne({
            where: { userId, brokerConnectionId: this.brokerScope(brokerConnectionId) },
        });
        return performance?.currentHighWaterMark ?? '0';
    }
    async getOrCreatePerformance(userId, brokerConnectionId, currency) {
        const existing = await this.performanceRepo.findOne({
            where: { userId, brokerConnectionId: this.brokerScope(brokerConnectionId) },
        });
        if (existing)
            return existing;
        const perf = this.performanceRepo.create({ userId, brokerConnectionId, currency });
        return this.performanceRepo.save(perf);
    }
    async findApplicablePolicy(planId) {
        if (planId) {
            const planPolicy = await this.policyRepo.findOne({
                where: { planId, isActive: true },
            });
            if (planPolicy)
                return planPolicy;
        }
        const globalPolicy = await this.policyRepo.findOne({
            where: { planId: (0, typeorm_2.IsNull)(), isActive: true },
        });
        return globalPolicy ?? null;
    }
    brokerScope(brokerConnectionId) {
        return brokerConnectionId === null ? (0, typeorm_2.IsNull)() : brokerConnectionId;
    }
    async findExistingAssessment(userId, brokerConnectionId, periodStart, periodEnd) {
        return this.assessmentRepo.findOne({
            where: {
                userId,
                brokerConnectionId: this.brokerScope(brokerConnectionId),
                periodStart,
                periodEnd,
            },
        });
    }
    async findOutstandingAssessment(userId, brokerConnectionId) {
        return this.assessmentRepo.findOne({
            where: {
                userId,
                brokerConnectionId: this.brokerScope(brokerConnectionId),
                status: (0, typeorm_2.In)([performance_fee_assessment_entity_1.AssessmentStatus.ASSESSED, performance_fee_assessment_entity_1.AssessmentStatus.INVOICED]),
            },
        });
    }
};
exports.PerformanceFeeService = PerformanceFeeService;
exports.PerformanceFeeService = PerformanceFeeService = PerformanceFeeService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(performance_fee_policy_entity_1.PerformanceFeePolicy)),
    __param(1, (0, typeorm_1.InjectRepository)(trading_account_performance_entity_1.TradingAccountPerformance)),
    __param(2, (0, typeorm_1.InjectRepository)(performance_fee_assessment_entity_1.PerformanceFeeAssessment)),
    __param(3, (0, typeorm_1.InjectRepository)(performance_fee_ledger_entry_entity_1.PerformanceFeeLedgerEntry)),
    __param(4, (0, typeorm_1.InjectRepository)(invoice_entity_1.Invoice)),
    __param(5, (0, typeorm_1.InjectRepository)(payment_transaction_entity_1.PaymentTransaction)),
    __param(6, (0, typeorm_1.InjectRepository)(user_subscription_entity_1.UserSubscription)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        audit_service_1.AuditService])
], PerformanceFeeService);
//# sourceMappingURL=performance-fee.service.js.map