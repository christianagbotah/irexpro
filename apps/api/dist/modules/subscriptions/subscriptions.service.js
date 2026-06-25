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
var SubscriptionsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const subscription_plan_entity_1 = require("./entities/subscription-plan.entity");
const user_subscription_entity_1 = require("./entities/user-subscription.entity");
const audit_service_1 = require("../audit/audit.service");
const audit_action_enum_1 = require("../../common/enums/audit-action.enum");
const audit_log_entity_1 = require("../audit/entities/audit-log.entity");
let SubscriptionsService = SubscriptionsService_1 = class SubscriptionsService {
    constructor(planRepo, subscriptionRepo, auditService) {
        this.planRepo = planRepo;
        this.subscriptionRepo = subscriptionRepo;
        this.auditService = auditService;
        this.logger = new common_1.Logger(SubscriptionsService_1.name);
    }
    async findActivePlans() {
        return this.planRepo.find({
            where: { isActive: true },
            relations: ['pricing'],
            order: { createdAt: 'ASC' },
        });
    }
    async findUserSubscription(userId) {
        return this.subscriptionRepo.findOne({
            where: { userId },
            relations: ['plan', 'plan.pricing'],
            order: { createdAt: 'DESC' },
        });
    }
    async canUserStartAiAutoTrading(userId) {
        const subscription = await this.subscriptionRepo.findOne({
            where: { userId },
            relations: ['plan'],
            order: { createdAt: 'DESC' },
        });
        if (!subscription)
            return false;
        if (!subscription.plan?.allowsAiAutoTrading)
            return false;
        const now = new Date();
        if (subscription.status === user_subscription_entity_1.SubscriptionStatus.TRIAL) {
            return subscription.trialEndsAt != null && now < subscription.trialEndsAt;
        }
        if (subscription.status === user_subscription_entity_1.SubscriptionStatus.ACTIVE) {
            return subscription.currentPeriodEnd != null && now < subscription.currentPeriodEnd;
        }
        return false;
    }
    async manualActivate(userId, planId, activatedByAdminId, ipAddress) {
        const plan = await this.planRepo.findOne({ where: { id: planId } });
        if (!plan)
            throw new common_1.NotFoundException('Subscription plan not found');
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        let subscription = await this.subscriptionRepo.findOne({ where: { userId } });
        if (subscription) {
            subscription.subscriptionPlanId = planId;
            subscription.status = user_subscription_entity_1.SubscriptionStatus.ACTIVE;
            subscription.currentPeriodStart = now;
            subscription.currentPeriodEnd = periodEnd;
            subscription.trialEndsAt = null;
            subscription.cancelledAt = null;
            subscription.paymentProvider = 'manual';
            subscription.providerSubscriptionReference = null;
            subscription.metadata = {
                ...(subscription.metadata ?? {}),
                manualActivatedBy: activatedByAdminId,
                manualActivatedAt: now.toISOString(),
                note: 'DEV/TEST ONLY — ManualPaymentProvider activation',
            };
        }
        else {
            subscription = this.subscriptionRepo.create({
                userId,
                subscriptionPlanId: planId,
                status: user_subscription_entity_1.SubscriptionStatus.ACTIVE,
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
                paymentProvider: 'manual',
                metadata: {
                    manualActivatedBy: activatedByAdminId,
                    manualActivatedAt: now.toISOString(),
                    note: 'DEV/TEST ONLY — ManualPaymentProvider activation',
                },
            });
        }
        const saved = await this.subscriptionRepo.save(subscription);
        await this.auditService.log({
            actorUserId: activatedByAdminId,
            actorType: 'ADMIN',
            action: audit_action_enum_1.AuditAction.SUBSCRIPTION_MANUAL_ACTIVATED,
            resourceType: 'UserSubscription',
            resourceId: saved.id,
            ipAddress,
            metadata: {
                targetUserId: userId,
                planId,
                planName: plan.name,
                paymentProvider: 'manual',
                warning: 'ManualPaymentProvider — DEV/TEST only. Not for commercial use.',
            },
            severity: audit_log_entity_1.AuditSeverity.WARNING,
        });
        this.logger.warn(`[DEV/TEST] Manual subscription activated for user ${userId} by admin ${activatedByAdminId}`);
        return saved;
    }
};
exports.SubscriptionsService = SubscriptionsService;
exports.SubscriptionsService = SubscriptionsService = SubscriptionsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(subscription_plan_entity_1.SubscriptionPlan)),
    __param(1, (0, typeorm_1.InjectRepository)(user_subscription_entity_1.UserSubscription)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        audit_service_1.AuditService])
], SubscriptionsService);
//# sourceMappingURL=subscriptions.service.js.map