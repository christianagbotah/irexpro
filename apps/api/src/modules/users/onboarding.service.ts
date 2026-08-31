import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../users/entities/user.entity';
import { UserProfile } from '../users/entities/user-profile.entity';
import { RiskProfile } from '../risk/entities/risk-profile.entity';
import { BrokerConnection } from '../broker/entities/broker-connection.entity';
import { BrokerConnectionStatus } from '../broker/interfaces/broker-adapter.interface';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { EligibilityService } from './eligibility.service';

/**
 * OnboardingService — centralized trader onboarding/readiness aggregator.
 *
 * canStartTrading requires ALL of:
 *   1. User is ACTIVE (not SUSPENDED/PERMANENTLY_LOCKED/CLOSED)
 *   2. Profile is complete
 *   3. Sprint 44 eligibility gate is complete: jurisdiction ELIGIBLE and every
 *      exact current disclosure version/hash has immutable consent evidence
 *   4. Risk profile exists AND risk acknowledgement is accepted
 *   5. Kill switch is NOT active
 *   6. Broker connection is CONNECTED (healthy)
 *
 * The service is the first hard gate inside TradingService.startTradingSession.
 * Eligibility never bypasses or replaces broker, Risk Engine, or Execution Engine gates.
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private profileRepo: Repository<UserProfile>,
    @InjectRepository(RiskProfile)
    private riskProfileRepo: Repository<RiskProfile>,
    @InjectRepository(BrokerConnection)
    private brokerConnectionRepo: Repository<BrokerConnection>,
    private auditService: AuditService,
    private eligibilityService: EligibilityService,
  ) {}

  /**
   * Get the full onboarding status for a user. Does NOT mutate — safe to call
   * on every dashboard load. Audits TRADING_READINESS_CHECKED only when the
   * user is fully ready (to avoid audit spam on every dashboard poll).
   */
  async getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['profile'],
    });

    if (!user) {
      return {
        profileCompleted: false,
        eligibilityCompleted: false,
        riskProfileCompleted: false,
        brokerConnected: false,
        brokerConnectionStatus: 'NONE' as const,
        canStartTrading: false,
        missingSteps: ['PROFILE', 'ELIGIBILITY', 'RISK_PROFILE', 'BROKER_CONNECTION'],
        nextStep: 'PROFILE',
      };
    }

    // 1. Profile completion
    const profileCompleted = this.isProfileComplete(user);

    // 2. Eligibility + exact current disclosure evidence (Sprint 44)
    // Fail closed: a missing/unknown jurisdiction, required review, denial, or
    // missing disclosure evidence all keep canStartTrading=false.
    const eligibility = await this.eligibilityService.getStatus(userId);
    const eligibilityCompleted = eligibility.canProceed;

    // 3. Risk profile completion (exists + acknowledgement accepted)
    const riskProfile = await this.riskProfileRepo.findOne({ where: { userId } });
    const riskProfileCompleted = this.isRiskProfileComplete(riskProfile);

    // 4. Broker connection
    const activeConnection = await this.findActiveBrokerConnection(userId);
    const brokerConnected = !!activeConnection;
    const brokerConnectionStatus: BrokerConnectionStatus | 'NONE' = activeConnection
      ? activeConnection.status
      : 'NONE';

    // 5. Kill switch (if risk profile exists)
    const killSwitchActive = riskProfile?.killSwitchActive ?? false;

    // 6. User status
    const userActive = user.status === UserStatus.ACTIVE;

    const missingSteps: OnboardingStep[] = [];
    if (!profileCompleted) missingSteps.push('PROFILE');
    if (!eligibilityCompleted) missingSteps.push('ELIGIBILITY');
    if (!riskProfileCompleted) missingSteps.push('RISK_PROFILE');
    if (!brokerConnected) missingSteps.push('BROKER_CONNECTION');

    const canStartTrading =
      userActive &&
      profileCompleted &&
      eligibilityCompleted &&
      riskProfileCompleted &&
      brokerConnected &&
      !killSwitchActive;

    const nextStep: OnboardingNextStep = canStartTrading ? 'READY' : (missingSteps[0] ?? 'READY');

    if (canStartTrading) {
      await this.auditService
        .log({
          actorUserId: userId,
          action: AuditAction.TRADING_READINESS_CHECKED,
          resourceType: 'User',
          resourceId: userId,
          metadata: {
            canStartTrading: true,
            eligibilityPolicyVersion: eligibility.policyVersion,
            brokerConnectionId: activeConnection?.id,
          },
        })
        .catch(() => {
          /* audit never throws */
        });
    }

    return {
      profileCompleted,
      eligibilityCompleted,
      riskProfileCompleted,
      brokerConnected,
      brokerConnectionStatus,
      canStartTrading,
      missingSteps,
      nextStep,
    };
  }

  /**
   * Hard gate: can the user start automated trading?
   * Returns { allowed, missingSteps } — TradingService throws a structured 403
   * before touching broker/risk/session execution when this fails.
   */
  async canStartTrading(
    userId: string,
  ): Promise<{ allowed: boolean; missingSteps: OnboardingStep[] }> {
    const status = await this.getOnboardingStatus(userId);
    return {
      allowed: status.canStartTrading,
      missingSteps: status.missingSteps,
    };
  }

  private isProfileComplete(user: User): boolean {
    const profile = user.profile;
    if (!profile) return false;
    return !!(
      profile.firstName &&
      profile.lastName &&
      user.countryCode &&
      user.timezone &&
      user.preferredCurrency &&
      profile.tradingExperienceLevel
    );
  }

  private isRiskProfileComplete(riskProfile: RiskProfile | null): boolean {
    if (!riskProfile) return false;
    return riskProfile.riskAcknowledgementAccepted === true;
  }

  /**
   * Select ONLY fields needed for onboarding readiness; credentials and broker
   * provider secrets are never loaded. Query failures fail closed to no broker.
   */
  private async findActiveBrokerConnection(
    userId: string,
  ): Promise<Pick<
    BrokerConnection,
    'id' | 'status' | 'lastHealthCheckAt' | 'consecutiveFailureCount' | 'liveTradingEnabled'
  > | null> {
    try {
      const connection = await this.brokerConnectionRepo
        .createQueryBuilder('conn')
        .select([
          'conn.id',
          'conn.status',
          'conn.lastHealthCheckAt',
          'conn.consecutiveFailureCount',
          'conn.liveTradingEnabled',
        ])
        .where('conn.userId = :userId', { userId })
        .andWhere('conn.status = :status', { status: BrokerConnectionStatus.CONNECTED })
        .getOne();

      return connection as Pick<
        BrokerConnection,
        'id' | 'status' | 'lastHealthCheckAt' | 'consecutiveFailureCount' | 'liveTradingEnabled'
      > | null;
    } catch (err) {
      this.logger.error(
        `Failed to query broker connection for onboarding status (user ${userId}): ${(err as Error).message}`,
      );
      return null;
    }
  }
}

/** The onboarding steps a user must complete before trading. */
export type OnboardingStep = 'PROFILE' | 'ELIGIBILITY' | 'RISK_PROFILE' | 'BROKER_CONNECTION';

/** The next step the user should take, or READY if all complete. */
export type OnboardingNextStep = OnboardingStep | 'READY';

export interface OnboardingStatus {
  profileCompleted: boolean;
  eligibilityCompleted: boolean;
  riskProfileCompleted: boolean;
  brokerConnected: boolean;
  /** 'NONE' when the user has no broker connection at all. */
  brokerConnectionStatus: BrokerConnectionStatus | 'NONE';
  canStartTrading: boolean;
  missingSteps: OnboardingStep[];
  nextStep: OnboardingNextStep;
}
