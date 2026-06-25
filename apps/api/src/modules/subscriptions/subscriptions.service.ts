import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { UserSubscription, SubscriptionStatus } from './entities/user-subscription.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditSeverity } from '../audit/entities/audit-log.entity';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(SubscriptionPlan)
    private planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(UserSubscription)
    private subscriptionRepo: Repository<UserSubscription>,
    private auditService: AuditService,
  ) {}

  async findActivePlans(): Promise<SubscriptionPlan[]> {
    return this.planRepo.find({
      where: { isActive: true },
      relations: ['pricing'],
      order: { createdAt: 'ASC' },
    });
  }

  async findUserSubscription(userId: string): Promise<UserSubscription | null> {
    return this.subscriptionRepo.findOne({
      where: { userId },
      relations: ['plan', 'plan.pricing'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Determines if a user can activate AI Auto Trading.
   *
   * Returns true ONLY if:
   * - User has an ACTIVE or TRIAL subscription
   * - The subscription has not expired
   * - The subscription plan has allowsAiAutoTrading = true
   *
   * This check is server-side and must never be bypassed.
   */
  async canUserStartAiAutoTrading(userId: string): Promise<boolean> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { userId },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });

    if (!subscription) return false;
    if (!subscription.plan?.allowsAiAutoTrading) return false;

    const now = new Date();

    if (subscription.status === SubscriptionStatus.TRIAL) {
      return subscription.trialEndsAt != null && now < subscription.trialEndsAt;
    }

    if (subscription.status === SubscriptionStatus.ACTIVE) {
      return subscription.currentPeriodEnd != null && now < subscription.currentPeriodEnd;
    }

    return false;
  }

  /**
   * DEV/TEST ONLY — Manual subscription activation.
   *
   * This endpoint is ONLY for development, internal testing, and supervised pilot onboarding.
   * It must NEVER be used for commercial subscription billing of real paying customers.
   * All commercial subscriptions must go through a live IPaymentProvider implementation.
   *
   * Requires ADMIN or SUPER_ADMIN role.
   * Every activation is audit-logged with the admin's user ID.
   */
  async manualActivate(
    userId: string,
    planId: string,
    activatedByAdminId: string,
    ipAddress?: string,
  ): Promise<UserSubscription> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Subscription plan not found');

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    let subscription = await this.subscriptionRepo.findOne({ where: { userId } });

    if (subscription) {
      subscription.subscriptionPlanId = planId;
      subscription.status = SubscriptionStatus.ACTIVE;
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
    } else {
      subscription = this.subscriptionRepo.create({
        userId,
        subscriptionPlanId: planId,
        status: SubscriptionStatus.ACTIVE,
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
      action: AuditAction.SUBSCRIPTION_MANUAL_ACTIVATED,
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
      severity: AuditSeverity.WARNING,
    });

    this.logger.warn(
      `[DEV/TEST] Manual subscription activated for user ${userId} by admin ${activatedByAdminId}`,
    );

    return saved;
  }
}
