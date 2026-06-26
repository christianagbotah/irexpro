import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BrokerService } from '../broker/broker.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { RiskService } from '../risk/risk.service';
import { ExecutionService } from '../execution/execution.service';
import { AuditService } from '../audit/audit.service';
import { DomainEventBus } from '../events/event-bus.service';
import { DomainEventType } from '../events/enums/domain-event-type.enum';
import { AiEngineClient } from '../ai-engine-client/ai-engine-client.service';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditSeverity } from '../audit/entities/audit-log.entity';
import { TradingSession, TradingSessionStatus } from '../execution/entities/trading-session.entity';

/**
 * TradingService — Trading session lifecycle management.
 *
 * Orchestrates all pre-session checks before delegating to ExecutionService
 * for actual session record management.
 *
 * Mandatory gates before starting a session:
 *   1. Active subscription with allowsAiAutoTrading
 *   2. Active broker connection (CONNECTED status)
 *   3. Risk profile exists (created with safe defaults if absent)
 *   4. Kill switch NOT active
 *   5. Demo/paper mode is the default unless explicitly overridden
 *
 * Stopping a session:
 *   1. Finds the active session
 *   2. Sets status = ENDED
 *   3. Emits trading.session.stopped event
 *   4. Audit-logs the action
 *
 * CRITICAL: Signal routing is NOT managed here.
 * Signals flow through: AI Signal Engine → Strategy Orchestrator → Risk Engine → Execution Engine
 *
 * See: docs/architecture/04-system-architecture.md §6
 * See: docs/architecture/09-broker-integration-architecture.md
 */
@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);

  constructor(
    private readonly brokerService: BrokerService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly riskService: RiskService,
    @Inject(forwardRef(() => ExecutionService))
    private readonly executionService: ExecutionService,
    private readonly auditService: AuditService,
    private readonly eventBus: DomainEventBus,
    private readonly aiEngineClient: AiEngineClient,
  ) {}

  /**
   * Start a new trading session.
   *
   * Prerequisites (all must pass):
   *   1. Valid subscription with AI auto-trading enabled
   *   2. Active broker connection
   *   3. Kill switch not active
   *   4. No currently active session (returns existing if found)
   *
   * Emits: DomainEventType.TRADING_SESSION_STARTED
   */
  async startTradingSession(
    userId: string,
    brokerConnectionId?: string,
  ): Promise<TradingSession> {
    // ── Gate 1: Subscription check ────────────────────────────────────────────
    const canTrade = await this.subscriptionsService.canUserStartAiAutoTrading(userId);
    if (!canTrade) {
      throw new ForbiddenException(
        'You do not have an active subscription that allows AI Auto Trading.',
      );
    }

    // ── Gate 2: Broker connection check ───────────────────────────────────────
    const hasActiveBroker = await this.brokerService.hasActiveConnection(userId);
    if (!hasActiveBroker) {
      throw new ForbiddenException(
        'No active broker connection. Connect and verify a broker account first.',
      );
    }

    // Resolve specific broker connection
    const connectionId = await this.resolveConnectionId(userId, brokerConnectionId);

    // ── Gate 3: Kill switch check ─────────────────────────────────────────────
    const killSwitchActive = await this.riskService.isKillSwitchActive(userId);
    if (killSwitchActive) {
      throw new ForbiddenException(
        'AI trading kill switch is active. Deactivate it before starting a session.',
      );
    }

    // ── Ensure risk profile exists ────────────────────────────────────────────
    await this.riskService.getOrCreateProfile(userId);

    // ── Start session via ExecutionService ────────────────────────────────────
    const brokerState = await this.brokerService.getBrokerAccountState(connectionId);
    const openingBalance = brokerState?.balance ?? '0';

    const session = await this.executionService.startSession(userId, connectionId, openingBalance);

    await this.auditService.log({
      actorUserId: userId,
      action: AuditAction.AI_TRADING_ENABLED,
      severity: AuditSeverity.INFO,
      resourceType: 'TradingSession',
      resourceId: session.id,
      metadata: {
        brokerConnectionId: connectionId,
        openingBalance,
        sessionId: session.id,
      },
    });

    this.eventBus.publish(DomainEventType.TRADING_SESSION_STARTED, userId, {
      sessionId: session.id,
      userId,
      brokerConnectionId: connectionId,
      status: session.status,
      startedAt: session.startedAt,
    });

    this.logger.log(`Trading session started: userId=${userId} sessionId=${session.id}`);

    // Notify AI engine scheduler (non-blocking — failures are logged only)
    void this.aiEngineClient
      .notifySessionStarted({
        userId,
        tradingSessionId: session.id,
        brokerConnectionId: connectionId,
        instruments: ['EURUSD'],
        timeframe: 'H1',
        source: 'broker',
        mode: 'paper',
      })
      .catch((err: Error) =>
        this.logger.warn(
          `AI engine start notification failed session=${session.id}: ${err.message}`,
        ),
      );

    return session;
  }

  /**
   * Stop the user's active trading session.
   *
   * Sets status to ENDED. Does NOT auto-close open trades in this sprint.
   * Emits: DomainEventType.TRADING_SESSION_STOPPED
   */
  async stopTradingSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.executionService.getActiveSession(userId);

    if (!session) {
      throw new NotFoundException('No active trading session found.');
    }

    if (session.id !== sessionId) {
      throw new ForbiddenException('Session ID does not match your active session.');
    }

    await this.executionService.endSession(userId, TradingSessionStatus.ENDED);

    await this.auditService.log({
      actorUserId: userId,
      action: AuditAction.AI_TRADING_DISABLED,
      severity: AuditSeverity.INFO,
      resourceType: 'TradingSession',
      resourceId: sessionId,
      metadata: { sessionId, reason: 'user-requested-stop' },
    });

    this.eventBus.publish(DomainEventType.TRADING_SESSION_STOPPED, userId, {
      sessionId,
      userId,
      brokerConnectionId: session.brokerConnectionId,
      status: TradingSessionStatus.ENDED,
      endedAt: new Date(),
    });

    this.logger.log(`Trading session stopped: userId=${userId} sessionId=${sessionId}`);

    void this.aiEngineClient
      .notifySessionStopped({ tradingSessionId: sessionId })
      .catch((err: Error) =>
        this.logger.warn(
          `AI engine stop notification failed session=${sessionId}: ${err.message}`,
        ),
      );
  }

  /**
   * Get the current active session for a user.
   */
  async getActiveSession(userId: string): Promise<TradingSession | null> {
    return this.executionService.getActiveSession(userId);
  }

  /**
   * Get a specific session by ID (must belong to user).
   */
  async getSessionById(userId: string, sessionId: string): Promise<TradingSession | null> {
    const session = await this.executionService.findSessionById(sessionId);
    if (!session || session.userId !== userId) return null;
    return session;
  }

  /**
   * Gate check only (legacy — used by older code paths).
   * Throws ForbiddenException if broker gate fails.
   */
  async assertBrokerGate(userId: string): Promise<void> {
    const hasActiveBroker = await this.brokerService.hasActiveConnection(userId);
    if (!hasActiveBroker) {
      throw new ForbiddenException(
        'No active broker connection. Connect and verify a broker account before starting AI auto-trading.',
      );
    }
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  private async resolveConnectionId(
    userId: string,
    requestedId?: string,
  ): Promise<string> {
    if (requestedId) return requestedId;
    const connection = await this.brokerService.findActiveConnectionForUser(userId);
    if (!connection) {
      throw new ForbiddenException('No active broker connection found.');
    }
    return connection.id;
  }
}
