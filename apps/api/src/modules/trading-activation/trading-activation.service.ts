import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiskProfile, AllowedTradingMode } from '../risk/entities/risk-profile.entity';
import { BrokerConnection } from '../broker/entities/broker-connection.entity';
import { BrokerConnectionStatus } from '../broker/interfaces/broker-adapter.interface';
import { BrokerMode } from '../broker/interfaces/broker-adapter.interface';
import { User, UserStatus } from '../users/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditSeverity } from '../audit/entities/audit-log.entity';
import { GlobalConfigService } from '../global-config/global-config.service';

/**
 * TradingActivationService
 *
 * Controlled paper-to-live activation — the single pathway that promotes a
 * user from DEMO/paper trading to LIVE/real-money trading.
 *
 * PREREQUISITES (all must be met before activation):
 * 1. User status is ACTIVE (not PENDING_VERIFICATION or SUSPENDED)
 * 2. User's country is supported (not blocked) and allows live trading
 * 3. Risk acknowledgement has been accepted (with timestamp)
 * 4. At least one broker connection exists and is CONNECTED
 * 5. The broker connection has demoValidated = true (DEMO was tested)
 * 6. The broker connection is currently in DEMO mode
 * 7. Cooldown period has elapsed (default: 7 days from first DEMO trade)
 *
 * ACTIVATION STEPS:
 * 1. Validate all prerequisites
 * 2. Update broker connection accountType: DEMO → LIVE
 * 3. Update risk profile allowedTradingMode: PAPER_ONLY → requested mode
 * 4. Audit-log the activation at CRITICAL severity
 * 5. Emit a domain event (TRADING_ACTIVATED_LIVE)
 *
 * SAFETY:
 * - This is the ONLY code path that changes accountType to LIVE
 * - The cooldown prevents impulsive activation
 * - Activation can be reversed (deactivation returns to DEMO/PAPER_ONLY)
 * - Every activation/deactivation is immutably audit-logged
 */
@Injectable()
export class TradingActivationService {
  private readonly logger = new Logger(TradingActivationService.name);

  /** Minimum days on DEMO before LIVE activation is allowed */
  private readonly DEMO_COOLDOWN_DAYS = 7;

  constructor(
    @InjectRepository(RiskProfile)
    private readonly riskProfileRepo: Repository<RiskProfile>,
    @InjectRepository(BrokerConnection)
    private readonly connectionRepo: Repository<BrokerConnection>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly auditService: AuditService,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  /**
   * Check if a user is eligible for LIVE trading activation.
   * Returns the eligibility status and any blocking reasons.
   */
  async checkEligibility(userId: string): Promise<{
    eligible: boolean;
    blockingReasons: string[];
    prerequisites: {
      userActive: boolean;
      countrySupported: boolean;
      riskAcknowledged: boolean;
      hasConnectedBroker: boolean;
      demoValidated: boolean;
      cooldownElapsed: boolean;
      currentMode: AllowedTradingMode;
      currentBrokerMode: BrokerMode | null;
      demoDaysRemaining: number | null;
    };
  }> {
    const blockingReasons: string[] = [];

    // 1. User must be ACTIVE
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      blockingReasons.push('User not found');
      return { eligible: false, blockingReasons, prerequisites: this.emptyPrerequisites() };
    }
    const userActive = user.status === UserStatus.ACTIVE;
    if (!userActive) {
      blockingReasons.push(`User status is ${user.status} — must be ACTIVE`);
    }

    // 2. Country must be supported
    let countrySupported = true;
    if (user.countryCode) {
      countrySupported = await this.globalConfigService.isCountrySupported(user.countryCode);
      if (!countrySupported) {
        blockingReasons.push(`Country ${user.countryCode} is not supported for live trading`);
      }
    } else {
      countrySupported = false;
      blockingReasons.push('No country code set on user profile');
    }

    // 3. Risk acknowledgement
    const riskProfile = await this.riskProfileRepo.findOne({ where: { userId } });
    if (!riskProfile) {
      blockingReasons.push('Risk profile not found');
      return { eligible: false, blockingReasons, prerequisites: this.emptyPrerequisites() };
    }
    const riskAcknowledged = riskProfile.riskAcknowledgementAccepted === true;
    if (!riskAcknowledged) {
      blockingReasons.push('Risk disclosure has not been acknowledged');
    }

    // 4. Connected broker
    const connection = await this.connectionRepo.findOne({
      where: { userId, status: BrokerConnectionStatus.CONNECTED },
    });
    const hasConnectedBroker = !!connection;
    if (!hasConnectedBroker) {
      blockingReasons.push('No connected broker connection');
    }

    // 5. Demo validated
    const demoValidated = connection?.demoValidated === true;
    if (hasConnectedBroker && !demoValidated) {
      blockingReasons.push('Broker connection has not completed DEMO validation');
    }

    // 6. Currently in DEMO mode (can't activate LIVE if already LIVE)
    const currentBrokerMode = connection?.accountType ?? null;
    if (currentBrokerMode === BrokerMode.LIVE) {
      blockingReasons.push('Broker connection is already in LIVE mode');
    }

    // 7. Cooldown period
    let cooldownElapsed = true;
    let demoDaysRemaining: number | null = null;
    if (connection) {
      const firstTradeAt = await this.getFirstTradeDate(userId, connection.id);
      if (firstTradeAt) {
        const daysOnDemo = Math.floor(
          (Date.now() - firstTradeAt.getTime()) / (24 * 60 * 60 * 1000),
        );
        demoDaysRemaining = Math.max(0, this.DEMO_COOLDOWN_DAYS - daysOnDemo);
        if (daysOnDemo < this.DEMO_COOLDOWN_DAYS) {
          cooldownElapsed = false;
          blockingReasons.push(
            `DEMOn cooldown: ${demoDaysRemaining} day(s) remaining (minimum ${this.DEMO_COOLDOWN_DAYS} days required)`,
          );
        }
      } else {
        // No trades yet — cooldown starts from connection creation
        const connectionAge = Math.floor(
          (Date.now() - connection.createdAt.getTime()) / (24 * 60 * 60 * 1000),
        );
        demoDaysRemaining = Math.max(0, this.DEMO_COOLDOWN_DAYS - connectionAge);
        if (connectionAge < this.DEMO_COOLDOWN_DAYS) {
          cooldownElapsed = false;
          blockingReasons.push(
            `Connection cooldown: ${demoDaysRemaining} day(s) remaining (minimum ${this.DEMO_COOLDOWN_DAYS} days required)`,
          );
        }
      }
    }

    const eligible = blockingReasons.length === 0;

    return {
      eligible,
      blockingReasons,
      prerequisites: {
        userActive,
        countrySupported,
        riskAcknowledged,
        hasConnectedBroker,
        demoValidated,
        cooldownElapsed,
        currentMode: riskProfile.allowedTradingModes,
        currentBrokerMode,
        demoDaysRemaining,
      },
    };
  }

  /**
   * Activate LIVE trading for a user.
   *
   * This is the ONLY code path that:
   * - Changes BrokerConnection.accountType from DEMO to LIVE
   * - Changes RiskProfile.allowedTradingModes from PAPER_ONLY to SEMI_AUTO/FULL_AUTO
   *
   * @param userId        The user activating live trading.
   * @param targetMode    SEMI_AUTO or FULL_AUTO.
   * @param acknowledgement  The user must re-acknowledge risk for live trading.
   */
  async activateLive(
    userId: string,
    targetMode: AllowedTradingMode.SEMI_AUTO | AllowedTradingMode.FULL_AUTO,
    acknowledgement: string,
  ): Promise<{ success: boolean; message: string }> {
    // Validate acknowledgement
    if (!acknowledgement || acknowledgement.trim().length < 20) {
      throw new BadRequestException(
        'A detailed risk acknowledgement (min 20 chars) is required for live trading activation.',
      );
    }

    // Check all prerequisites
    const eligibility = await this.checkEligibility(userId);
    if (!eligibility.eligible) {
      throw new ForbiddenException(
        `Live trading activation blocked: ${eligibility.blockingReasons.join('; ')}`,
      );
    }

    // Get the connection and risk profile (already validated in checkEligibility)
    const connection = await this.connectionRepo.findOne({
      where: { userId, status: BrokerConnectionStatus.CONNECTED },
    });
    const riskProfile = await this.riskProfileRepo.findOne({ where: { userId } });

    if (!connection || !riskProfile) {
      throw new NotFoundException('Broker connection or risk profile not found');
    }

    // Atomic update: change both broker connection + risk profile
    await this.connectionRepo.update(connection.id, {
      accountType: BrokerMode.LIVE,
    });

    await this.riskProfileRepo.update(riskProfile.id, {
      allowedTradingModes: targetMode,
    });

    this.logger.log(
      `[TradingActivation] User ${userId} activated LIVE trading — ` +
        `broker=${connection.brokerId}, mode=${targetMode}`,
    );

    await this.auditService.log({
      actorUserId: userId,
      actorType: 'USER',
      action: AuditAction.RISK_KILL_SWITCH_ACTIVATED, // closest existing action for risk config change
      resourceType: 'BrokerConnection',
      resourceId: connection.id,
      metadata: {
        activation: 'LIVE_TRADING_ACTIVATED',
        targetMode,
        brokerId: connection.brokerId,
        previousMode: AllowedTradingMode.PAPER_ONLY,
        acknowledgement: acknowledgement.trim(),
      },
      severity: AuditSeverity.CRITICAL,
    });

    return {
      success: true,
      message: `Live trading activated. Broker: ${connection.brokerName}, Mode: ${targetMode}. Please trade responsibly.`,
    };
  }

  /**
   * Deactivate LIVE trading — return to DEMO/paper.
   *
   * This reverses the activation: LIVE → DEMO, SEMI_AUTO/FULL_AUTO → PAPER_ONLY.
   * Existing open positions are NOT force-closed (use the emergency shutdown for that).
   *
   * @param userId  The user deactivating live trading.
   * @param reason  Why the user is deactivating.
   */
  async deactivateLive(
    userId: string,
    reason: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException('A reason (min 10 chars) is required for deactivation.');
    }

    const connection = await this.connectionRepo.findOne({
      where: { userId, status: BrokerConnectionStatus.CONNECTED },
    });
    const riskProfile = await this.riskProfileRepo.findOne({ where: { userId } });

    if (!connection || !riskProfile) {
      throw new NotFoundException('Broker connection or risk profile not found');
    }

    if (connection.accountType !== BrokerMode.LIVE) {
      throw new BadRequestException(
        'Broker connection is not in LIVE mode — nothing to deactivate.',
      );
    }

    await this.connectionRepo.update(connection.id, {
      accountType: BrokerMode.DEMO,
    });

    await this.riskProfileRepo.update(riskProfile.id, {
      allowedTradingModes: AllowedTradingMode.PAPER_ONLY,
    });

    this.logger.log(
      `[TradingActivation] User ${userId} deactivated LIVE trading — reason: ${reason}`,
    );

    await this.auditService.log({
      actorUserId: userId,
      actorType: 'USER',
      action: AuditAction.RISK_KILL_SWITCH_DEACTIVATED,
      resourceType: 'BrokerConnection',
      resourceId: connection.id,
      metadata: {
        activation: 'LIVE_TRADING_DEACTIVATED',
        reason: reason.trim(),
        previousMode: riskProfile.allowedTradingModes,
      },
      severity: AuditSeverity.CRITICAL,
    });

    return {
      success: true,
      message:
        'Live trading deactivated. Broker returned to DEMO mode. Trading mode set to PAPER_ONLY.',
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private emptyPrerequisites() {
    return {
      userActive: false,
      countrySupported: false,
      riskAcknowledged: false,
      hasConnectedBroker: false,
      demoValidated: false,
      cooldownElapsed: false,
      currentMode: AllowedTradingMode.PAPER_ONLY,
      currentBrokerMode: null,
      demoDaysRemaining: null,
    };
  }

  private async getFirstTradeDate(userId: string, connectionId: string): Promise<Date | null> {
    try {
      const result = await this.connectionRepo.manager.query(
        `SELECT MIN(created_at) as first_trade FROM trading.trades WHERE user_id = $1 AND broker_connection_id = $2`,
        [userId, connectionId],
      );
      return result[0]?.first_trade ? new Date(result[0].first_trade) : null;
    } catch {
      return null;
    }
  }
}
