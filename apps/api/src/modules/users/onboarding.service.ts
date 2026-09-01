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
 * OnboardingService — centralized onboarding/readiness aggregator.
 *
 * Readiness requires all existing account gates plus the server-authoritative
 * eligibility service. Sprint 45 extends that eligibility gate with adult-age
 * and approved KYC state, while profile completion now requires a DOB.
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

    const profileCompleted = this.isProfileComplete(user);

    // Fail closed: jurisdiction, adult age, KYC, or exact disclosure evidence
    // can independently keep eligibility incomplete.
    const eligibility = await this.eligibilityService.getStatus(userId);
    const eligibilityCompleted = eligibility.canProceed;

    const riskProfile = await this.riskProfileRepo.findOne({ where: { userId } });
    const riskProfileCompleted = this.isRiskProfileComplete(riskProfile);

    const activeConnection = await this.findActiveBrokerConnection(userId);
    const brokerConnected = !!activeConnection;
    const brokerConnectionStatus: BrokerConnectionStatus | 'NONE' = activeConnection
      ? activeConnection.status
      : 'NONE';

    const killSwitchActive = riskProfile?.killSwitchActive ?? false;
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
      profile.dateOfBirth &&
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
   * Select only the fields needed for readiness; credentials and provider
   * secrets are never loaded. Query failures fail closed to no connection.
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

export type OnboardingStep = 'PROFILE' | 'ELIGIBILITY' | 'RISK_PROFILE' | 'BROKER_CONNECTION';
export type OnboardingNextStep = OnboardingStep | 'READY';

export interface OnboardingStatus {
  profileCompleted: boolean;
  eligibilityCompleted: boolean;
  riskProfileCompleted: boolean;
  brokerConnected: boolean;
  brokerConnectionStatus: BrokerConnectionStatus | 'NONE';
  canStartTrading: boolean;
  missingSteps: OnboardingStep[];
  nextStep: OnboardingNextStep;
}
