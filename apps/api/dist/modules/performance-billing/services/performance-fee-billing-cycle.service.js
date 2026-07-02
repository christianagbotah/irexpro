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
var PerformanceFeeBillingCycleService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceFeeBillingCycleService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const performance_fee_billing_cycle_entity_1 = require("../entities/performance-fee-billing-cycle.entity");
const broker_trade_reconciliation_service_1 = require("../../broker-reconciliation/services/broker-trade-reconciliation.service");
const broker_trade_reconciliation_run_entity_1 = require("../../broker-reconciliation/entities/broker-trade-reconciliation-run.entity");
const performance_fee_service_1 = require("../../performance-fees/services/performance-fee.service");
const audit_service_1 = require("../../audit/audit.service");
const audit_action_enum_1 = require("../../../common/enums/audit-action.enum");
const audit_log_entity_1 = require("../../audit/entities/audit-log.entity");
const performance_fee_assessment_entity_1 = require("../../performance-fees/entities/performance-fee-assessment.entity");
const MAX_CYCLE_DAYS = 366;
let PerformanceFeeBillingCycleService = PerformanceFeeBillingCycleService_1 = class PerformanceFeeBillingCycleService {
    constructor(cycleRepo, reconService, perfFeeService, auditService) {
        this.cycleRepo = cycleRepo;
        this.reconService = reconService;
        this.perfFeeService = perfFeeService;
        this.auditService = auditService;
        this.logger = new common_1.Logger(PerformanceFeeBillingCycleService_1.name);
    }
    async getBillingCycle(id) {
        const cycle = await this.cycleRepo.findOne({ where: { id } });
        if (!cycle)
            throw new common_1.NotFoundException(`Billing cycle ${id} not found`);
        return cycle;
    }
    async listBillingCycles(filters) {
        const where = {};
        if (filters.userId)
            where['userId'] = filters.userId;
        if (filters.status)
            where['status'] = filters.status;
        return this.cycleRepo.find({
            where,
            order: { createdAt: 'DESC' },
            take: filters.limit ?? 100,
        });
    }
    async createBillingCycle(userId, brokerConnectionId, periodStart, periodEnd, currency, actorId, ipAddress) {
        this.validatePeriod(periodStart, periodEnd);
        const cycle = this.cycleRepo.create({
            userId,
            brokerConnectionId,
            periodStart,
            periodEnd,
            currency,
            status: performance_fee_billing_cycle_entity_1.BillingCycleStatus.DRAFT,
            createdByUserId: actorId,
            metadata: { createdBy: actorId },
        });
        let saved;
        try {
            saved = await this.cycleRepo.save(cycle);
        }
        catch (err) {
            if (err instanceof typeorm_2.QueryFailedError && err.code === '23505') {
                throw new common_1.ConflictException(`A billing cycle already exists for this user/broker/period ` +
                    `(userId=${userId}, brokerConnectionId=${brokerConnectionId ?? 'null'}, ` +
                    `periodStart=${periodStart.toISOString()}, periodEnd=${periodEnd.toISOString()})`);
            }
            throw err;
        }
        await this.auditService.log({
            actorUserId: actorId,
            actorType: 'ADMIN',
            action: audit_action_enum_1.AuditAction.PERFORMANCE_BILLING_CYCLE_CREATED,
            resourceType: 'PerformanceFeeBillingCycle',
            resourceId: saved.id,
            ipAddress,
            metadata: {
                userId,
                brokerConnectionId,
                periodStart: periodStart.toISOString(),
                periodEnd: periodEnd.toISOString(),
                currency,
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        this.logger.log(`[BillingCycle] Created cycle ${saved.id} for user ${userId} (DRAFT)`);
        return saved;
    }
    async runBillingCycle(cycleId, actorId, ipAddress) {
        const cycle = await this.getBillingCycle(cycleId);
        if (performance_fee_billing_cycle_entity_1.FINAL_BILLING_CYCLE_STATUSES.has(cycle.status)) {
            throw new common_1.BadRequestException(`Billing cycle ${cycleId} is in a final state (${cycle.status}) and cannot be rerun. ` +
                `Final states: INVOICED, NO_FEE_DUE, CANCELLED.`);
        }
        if (cycle.status !== performance_fee_billing_cycle_entity_1.BillingCycleStatus.DRAFT &&
            cycle.status !== performance_fee_billing_cycle_entity_1.BillingCycleStatus.FAILED) {
            throw new common_1.BadRequestException(`Billing cycle ${cycleId} is currently in status ${cycle.status}. ` +
                `Only DRAFT or FAILED cycles can be run.`);
        }
        await this.auditService.log({
            actorUserId: actorId,
            actorType: 'ADMIN',
            action: audit_action_enum_1.AuditAction.PERFORMANCE_BILLING_CYCLE_STARTED,
            resourceType: 'PerformanceFeeBillingCycle',
            resourceId: cycleId,
            ipAddress,
            metadata: {
                userId: cycle.userId,
                brokerConnectionId: cycle.brokerConnectionId,
                periodStart: cycle.periodStart.toISOString(),
                periodEnd: cycle.periodEnd.toISOString(),
                previousStatus: cycle.status,
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        this.logger.log(`[BillingCycle] Starting cycle ${cycleId} for user ${cycle.userId}`);
        if (!cycle.brokerConnectionId) {
            await this.transition(cycleId, performance_fee_billing_cycle_entity_1.BillingCycleStatus.RECONCILING);
            await this.transition(cycleId, performance_fee_billing_cycle_entity_1.BillingCycleStatus.RECONCILED);
        }
        else {
            await this.transition(cycleId, performance_fee_billing_cycle_entity_1.BillingCycleStatus.RECONCILING);
            let reconRun;
            try {
                reconRun = await this.reconService.runReconciliation(cycle.userId, cycle.brokerConnectionId, cycle.periodStart, cycle.periodEnd, actorId, ipAddress);
            }
            catch (err) {
                const errorSummary = this.safeErrorSummary(err);
                await this.failCycle(cycleId, errorSummary, actorId, ipAddress);
                const failed = await this.cycleRepo.findOne({ where: { id: cycleId } });
                return failed;
            }
            await this.cycleRepo.update(cycleId, {
                reconciliationRunId: reconRun.id,
                totalLedgerEntriesCreated: reconRun.newLedgerEntriesCreated ?? 0,
            });
            if (reconRun.status === broker_trade_reconciliation_run_entity_1.ReconciliationRunStatus.FAILED) {
                await this.failCycle(cycleId, this.safeErrorSummary(new Error(`Reconciliation run ${reconRun.id} failed: ${reconRun.errorSummary ?? 'unknown error'}`)), actorId, ipAddress);
                return this.cycleRepo.findOne({ where: { id: cycleId } });
            }
            await this.auditService.log({
                actorUserId: actorId,
                actorType: 'ADMIN',
                action: audit_action_enum_1.AuditAction.PERFORMANCE_BILLING_CYCLE_RECONCILED,
                resourceType: 'PerformanceFeeBillingCycle',
                resourceId: cycleId,
                ipAddress,
                metadata: {
                    userId: cycle.userId,
                    reconciliationRunId: reconRun.id,
                    totalSeen: reconRun.totalBrokerTradesSeen,
                    newLedgerEntriesCreated: reconRun.newLedgerEntriesCreated,
                    duplicatesSkipped: reconRun.duplicateTradesSkipped,
                },
                severity: audit_log_entity_1.AuditSeverity.INFO,
            });
            await this.transition(cycleId, performance_fee_billing_cycle_entity_1.BillingCycleStatus.RECONCILED);
        }
        await this.transition(cycleId, performance_fee_billing_cycle_entity_1.BillingCycleStatus.ASSESSING);
        let assessment;
        try {
            assessment = await this.perfFeeService.calculateAssessment(cycle.userId, cycle.brokerConnectionId, cycle.currency, cycle.periodStart, cycle.periodEnd, actorId, ipAddress);
        }
        catch (err) {
            const errorSummary = this.safeErrorSummary(err);
            await this.failCycle(cycleId, errorSummary, actorId, ipAddress);
            const failed = await this.cycleRepo.findOne({ where: { id: cycleId } });
            return failed;
        }
        await this.cycleRepo.update(cycleId, {
            assessmentId: assessment.id,
            totalRealisedProfit: assessment.realisedProfitForFee ?? '0',
            feeAmount: assessment.feeAmount ?? '0',
        });
        await this.auditService.log({
            actorUserId: actorId,
            actorType: 'ADMIN',
            action: audit_action_enum_1.AuditAction.PERFORMANCE_BILLING_CYCLE_ASSESSED,
            resourceType: 'PerformanceFeeBillingCycle',
            resourceId: cycleId,
            ipAddress,
            metadata: {
                userId: cycle.userId,
                assessmentId: assessment.id,
                assessmentStatus: assessment.status,
                feeAmount: assessment.feeAmount,
                currency: cycle.currency,
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        await this.transition(cycleId, performance_fee_billing_cycle_entity_1.BillingCycleStatus.ASSESSED);
        if (BigInt(assessment.feeAmount) <= 0n) {
            await this.cycleRepo.update(cycleId, {
                status: performance_fee_billing_cycle_entity_1.BillingCycleStatus.NO_FEE_DUE,
                completedAt: new Date(),
            });
            await this.auditService.log({
                actorUserId: actorId,
                actorType: 'ADMIN',
                action: audit_action_enum_1.AuditAction.PERFORMANCE_BILLING_CYCLE_NO_FEE_DUE,
                resourceType: 'PerformanceFeeBillingCycle',
                resourceId: cycleId,
                ipAddress,
                metadata: { userId: cycle.userId, assessmentId: assessment.id },
                severity: audit_log_entity_1.AuditSeverity.INFO,
            });
            this.logger.log(`[BillingCycle] Cycle ${cycleId} completed: NO_FEE_DUE`);
            return this.cycleRepo.findOne({ where: { id: cycleId } });
        }
        if (assessment.status !== performance_fee_assessment_entity_1.AssessmentStatus.ASSESSED) {
            const errorSummary = `Assessment ${assessment.id} is in status ${assessment.status} — cannot invoice`;
            await this.failCycle(cycleId, errorSummary, actorId, ipAddress);
            return this.cycleRepo.findOne({ where: { id: cycleId } });
        }
        let invoicedAssessment;
        try {
            invoicedAssessment = await this.perfFeeService.invoiceAssessment(assessment.id, actorId, ipAddress);
        }
        catch (err) {
            const errorSummary = this.safeErrorSummary(err);
            await this.failCycle(cycleId, errorSummary, actorId, ipAddress);
            return this.cycleRepo.findOne({ where: { id: cycleId } });
        }
        await this.cycleRepo.update(cycleId, {
            invoiceId: invoicedAssessment.invoiceId,
            status: performance_fee_billing_cycle_entity_1.BillingCycleStatus.INVOICED,
            completedAt: new Date(),
        });
        await this.auditService.log({
            actorUserId: actorId,
            actorType: 'ADMIN',
            action: audit_action_enum_1.AuditAction.PERFORMANCE_BILLING_CYCLE_INVOICED,
            resourceType: 'PerformanceFeeBillingCycle',
            resourceId: cycleId,
            ipAddress,
            metadata: {
                userId: cycle.userId,
                assessmentId: assessment.id,
                invoiceId: invoicedAssessment.invoiceId,
                feeAmount: assessment.feeAmount,
                currency: cycle.currency,
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        this.logger.log(`[BillingCycle] Cycle ${cycleId} INVOICED: invoice=${invoicedAssessment.invoiceId}, ` +
            `feeAmount=${assessment.feeAmount} ${cycle.currency}`);
        return this.cycleRepo.findOne({ where: { id: cycleId } });
    }
    async runBillingCycleForUserPeriod(userId, brokerConnectionId, periodStart, periodEnd, currency, actorId, ipAddress) {
        const existing = await this.findExistingCycle(userId, brokerConnectionId, periodStart, periodEnd);
        if (existing) {
            if (performance_fee_billing_cycle_entity_1.FINAL_BILLING_CYCLE_STATUSES.has(existing.status)) {
                throw new common_1.ConflictException(`A billing cycle in final state ${existing.status} already exists for this period ` +
                    `(id=${existing.id}). Create a new cycle with a different period.`);
            }
            if (existing.status !== performance_fee_billing_cycle_entity_1.BillingCycleStatus.DRAFT &&
                existing.status !== performance_fee_billing_cycle_entity_1.BillingCycleStatus.FAILED) {
                throw new common_1.ConflictException(`A billing cycle (${existing.id}) is already ${existing.status} for this period. ` +
                    `Wait for it to complete or cancel it first.`);
            }
            return this.runBillingCycle(existing.id, actorId, ipAddress);
        }
        const cycle = await this.createBillingCycle(userId, brokerConnectionId, periodStart, periodEnd, currency, actorId, ipAddress);
        return this.runBillingCycle(cycle.id, actorId, ipAddress);
    }
    async cancelBillingCycle(cycleId, reason, actorId, ipAddress) {
        const cycle = await this.getBillingCycle(cycleId);
        if (performance_fee_billing_cycle_entity_1.FINAL_BILLING_CYCLE_STATUSES.has(cycle.status)) {
            throw new common_1.BadRequestException(`Billing cycle ${cycleId} is already in final state ${cycle.status} and cannot be cancelled`);
        }
        const cancellableStatuses = new Set([performance_fee_billing_cycle_entity_1.BillingCycleStatus.DRAFT, performance_fee_billing_cycle_entity_1.BillingCycleStatus.FAILED]);
        if (!cancellableStatuses.has(cycle.status)) {
            throw new common_1.BadRequestException(`Billing cycle ${cycleId} is in status ${cycle.status}. ` +
                `Only DRAFT or FAILED cycles can be cancelled`);
        }
        await this.cycleRepo.update(cycleId, {
            status: performance_fee_billing_cycle_entity_1.BillingCycleStatus.CANCELLED,
            errorSummary: reason,
            completedAt: new Date(),
        });
        await this.auditService.log({
            actorUserId: actorId,
            actorType: 'ADMIN',
            action: audit_action_enum_1.AuditAction.PERFORMANCE_BILLING_CYCLE_CANCELLED,
            resourceType: 'PerformanceFeeBillingCycle',
            resourceId: cycleId,
            ipAddress,
            metadata: { userId: cycle.userId, reason },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        this.logger.log(`[BillingCycle] Cycle ${cycleId} CANCELLED: ${reason}`);
        return this.cycleRepo.findOne({ where: { id: cycleId } });
    }
    validatePeriod(periodStart, periodEnd) {
        const now = new Date();
        if (periodStart >= periodEnd) {
            throw new common_1.BadRequestException('periodStart must be before periodEnd');
        }
        if (periodEnd > now) {
            throw new common_1.BadRequestException(`periodEnd (${periodEnd.toISOString()}) cannot be in the future`);
        }
        const diffDays = (periodEnd.getTime() - periodStart.getTime()) / 86_400_000;
        if (diffDays > MAX_CYCLE_DAYS) {
            throw new common_1.BadRequestException(`Billing cycle window (${Math.ceil(diffDays)} days) exceeds the maximum of ${MAX_CYCLE_DAYS} days`);
        }
    }
    async transition(cycleId, newStatus) {
        await this.cycleRepo.update(cycleId, { status: newStatus });
    }
    async failCycle(cycleId, errorSummary, actorId, ipAddress) {
        await this.cycleRepo.update(cycleId, {
            status: performance_fee_billing_cycle_entity_1.BillingCycleStatus.FAILED,
            errorSummary,
            completedAt: new Date(),
        });
        const cycle = await this.cycleRepo.findOne({ where: { id: cycleId } });
        await this.auditService.log({
            actorUserId: actorId,
            actorType: 'ADMIN',
            action: audit_action_enum_1.AuditAction.PERFORMANCE_BILLING_CYCLE_FAILED,
            resourceType: 'PerformanceFeeBillingCycle',
            resourceId: cycleId,
            ipAddress,
            metadata: {
                userId: cycle?.userId ?? 'unknown',
                errorSummary,
            },
            severity: audit_log_entity_1.AuditSeverity.WARNING,
        });
        this.logger.error(`[BillingCycle] Cycle ${cycleId} FAILED: ${errorSummary}`);
    }
    safeErrorSummary(err) {
        const raw = err instanceof Error ? err.message : String(err);
        return raw.slice(0, 500);
    }
    async findExistingCycle(userId, brokerConnectionId, periodStart, periodEnd) {
        return this.cycleRepo.findOne({
            where: {
                userId,
                brokerConnectionId: brokerConnectionId === null ? (0, typeorm_2.IsNull)() : brokerConnectionId,
                periodStart,
                periodEnd,
            },
        });
    }
};
exports.PerformanceFeeBillingCycleService = PerformanceFeeBillingCycleService;
exports.PerformanceFeeBillingCycleService = PerformanceFeeBillingCycleService = PerformanceFeeBillingCycleService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(performance_fee_billing_cycle_entity_1.PerformanceFeeBillingCycle)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        broker_trade_reconciliation_service_1.BrokerTradeReconciliationService,
        performance_fee_service_1.PerformanceFeeService,
        audit_service_1.AuditService])
], PerformanceFeeBillingCycleService);
//# sourceMappingURL=performance-fee-billing-cycle.service.js.map