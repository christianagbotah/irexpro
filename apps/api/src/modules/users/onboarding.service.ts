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

/**
 * OnboardingService — Sprint 29 trader onboarding aggregator.
 *
 * Centralizes the logic for determining a user's onboarding progress and
 * trading readiness. Used by:
 *   - GET /users/me/onboarding-status (frontend onboarding wizard)
 *   - Admin user detail (onboarding visibility)
 *   - canStartTrading gate (called before any automated trading session)
 *
 * canStartTrading requires ALL of:
 *   1. User is ACTIVE (not SUSPENDED/CLOSED)
 *   2. Profile is complete (firstName + lastName + countryCode + timezone + preferredCurrency + tradingExperienceLevel)
 *   3. Risk profile exists AND risk acknowledgement is accepted
 *   4. Kill switch is NOT active
 *   5. Broker connection is CONNECTED (healthy)
 *
 * If any step is missing, `missingSteps` lists what's needed and `nextStep`
 * points to the first incomplete step.
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
      // Should not happen (JWT auth ensures the user exists), but handle safely
      return {
        profileCompleted: false,
        riskProfileCompleted: false,
        brokerConnected: false,
        brokerConnectionStatus: BrokerConnectionStatus.DISCONNECTED,
        canStartTrading: false,
        missingSteps: ['PROFILE', 'RISK_PROFILE', 'BROKER_CONNECTION'],
        nextStep: 'PROFILE',
      };
    }

    // 1. Profile completion
    const profileCompleted = this.isProfileComplete(user);

    // 2. Risk profile completion (exists + acknowledgement accepted)
    const riskProfile = await this.riskProfileRepo.findOne({ where: { userId } });
    const riskProfileCompleted = this.isRiskProfileComplete(riskProfile);

    // 3. Broker connection
    const activeConnection = await this.findActiveBrokerConnection(userId);
    const brokerConnected = !!activeConnection;
    const brokerConnectionStatus = activeConnection
      ? activeConnection.status
      : BrokerConnectionStatus.DISCONNECTED;

    // 4. Kill switch (if risk profile exists)
    const killSwitchActive = riskProfile?.killSwitchActive ?? false;

    // 5. User status
    const userActive = user.status === UserStatus.ACTIVE;

    // Aggregate missing steps
    const missingSteps: OnboardingStep[] = [];
    if (!profileCompleted) missingSteps.push('PROFILE');
    if (!riskProfileCompleted) missingSteps.push('RISK_PROFILE');
    if (!brokerConnected) missingSteps.push('BROKER_CONNECTION');

    const canStartTrading =
      userActive &&
      profileCompleted &&
      riskProfileCompleted &&
      brokerConnected &&
      !killSwitchActive;

    // Determine next step (first incomplete step)
    const nextStep: OnboardingNextStep = canStartTrading
      ? 'READY'
      : (missingSteps[0] ?? 'READY');

    // Audit only when the user is fully ready (avoids spam on every dashboard poll)
    if (canStartTrading) {
      await this.auditService.log({
        actorUserId: userId,
        action: AuditAction.TRADING_READINESS_CHECKED,
        resourceType: 'User',
        resourceId: userId,
        metadata: { canStartTrading: true, brokerConnectionId: activeConnection?.id },
      }).catch(() => { /* audit never throws */ });
    }

    return {
      profileCompleted,
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
   * Returns { allowed, missingSteps } — the caller throws ForbiddenException
   * if not allowed, with the missing steps in the message.
   */
  async canStartTrading(userId: string): Promise<{ allowed: boolean; missingSteps: OnboardingStep[] }> {
    const status = await this.getOnboardingStatus(userId);
    return {
      allowed: status.canStartTrading,
      missingSteps: status.missingSteps,
    };
  }

  /**
   * Profile is complete when the user has provided the core identity fields
   * needed for trading onboarding. Does NOT require email or phone specifically
   * (phone-only users are valid). The required fields are:
   *   - firstName (non-null)
   *   - lastName (non-null)
   *   - countryCode (non-null)
   *   - timezone (non-null)
   *   - preferredCurrency (non-null)
   *   - tradingExperienceLevel (non-null)
   */
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

  /**
   * Risk profile is complete when it exists AND the user has explicitly
   * accepted the risk acknowledgement. The profile is auto-created with
   * conservative defaults, so the existence + acknowledgement are the gates.
   */
  private isRiskProfileComplete(riskProfile: RiskProfile | null): boolean {
    if (!riskProfile) return false;
    return riskProfile.riskAcknowledgementAccepted === true;
  }

  /**
   * Find the user's active (CONNECTED) broker connection. Returns null if none.
   * Does NOT load encrypted credentials (selects only safe fields).
   */
  private async findActiveBrokerConnection(userId: string): Promise<BrokerConnection | null> {
    // Select only safe fields — never load encryptedCredentials/iv/tag
    const connection = await this.brokerConnectionRepo
      .createQueryBuilder('conn')
      .select([
        'conn.id',
        'conn.brokerId',
        'conn.brokerName',
        'conn.displayName',
        'conn.accountId',
        'conn.accountType',
        'conn.status',
        'conn.demoValidated',
        'conn.liveTradingEnabled',
        'conn.lastHealthCheckAt',
        'conn.lastSyncAt',
        'conn.lastErrorMessage',
        'conn.createdAt',
        'conn.updatedAt',
      ])
      .where('conn.userId = :userId', { userId })
      .andWhere('conn.status = :status', { status: BrokerConnectionStatus.CONNECTED })
      .getOne();

    return connection;
  }
}

/** The onboarding steps a user must complete before trading. */
export type OnboardingStep = 'PROFILE' | 'RISK_PROFILE' | 'BROKER_CONNECTION';

/** The next step the user should take, or READY if all complete. */
export type OnboardingNextStep = OnboardingStep | 'READY';

export interface OnboardingStatus {
  profileCompleted: boolean;
  riskProfileCompleted: boolean;
  brokerConnected: boolean;
  brokerConnectionStatus: BrokerConnectionStatus;
  canStartTrading: boolean;
  missingSteps: OnboardingStep[];
  nextStep: OnboardingNextStep;
}
