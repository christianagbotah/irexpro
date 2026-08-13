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
import { OnboardingService } from '../users/onboarding.service';
import { TradingNotReadyException } from '../../common/exceptions/trading-not-ready.exception';
import { AllowedTradingMode } from '../risk/entities/risk-profile.entity';
import { BrokerConnection } from '../broker/entities/broker-connection.entity';
import { BrokerConnectionStatus } from '../broker/interfaces/broker-adapter.interface';

/**
 * TradingService — Trading session lifecycle management.
 *
 * Sprint 29 amendment: the centralized OnboardingService.canStartTrading()
 * gate is now enforced as the FIRST check in startTradingSession(). This
 * cannot be bypassed — it runs inside the service, not just the controller.
 *
 * Mandatory gates before starting a session (ALL must pass):
 *   1. OnboardingService.canStartTrading() — profile complete + risk
 *      acknowledgement accepted + broker CONNECTED + kill switch NOT active
 *      + user ACTIVE. Returns structured 403 TRADING_NOT_READY + missingSteps.
 *   2. Active subscription with allowsAiAutoTrading
 *   3. Broker connection is CONNECTED AND healthy (fresh health check)
 *   4. Requested trading mode is permitted by riskProfile.allowedTradingModes
 *   5. Live trading (if requested) requires explicit broker enablement
 *
 * CRITICAL: Signal routing is NOT managed here.
 * Signals flow through: AI Signal Engine → Strategy Orchestrator → Risk Engine → Execution Engine
 * The risk gate remains between AI signals and broker execution — AI never
 * directly executes broker orders.
 *
 * See: docs/architecture/04-system-architecture.md §6
 * See: docs/architecture/09-broker-integration-architecture.md
 */
@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);

  /** Max staleness for broker health check before requiring a fresh check. */
  private static readonly BROKER_HEALTH_MAX_STALENESS_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly brokerService: BrokerService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly riskService: RiskService,
    private readonly onboardingService: OnboardingService,
    @Inject(forwardRef(() => ExecutionService))
    private readonly executionService: ExecutionService,
    private readonly auditService: AuditService,
    private readonly eventBus: DomainEventBus,
    private readonly aiEngineClient: AiEngineClient,
  ) {}

  /**
   * Start a new trading session.
   *
   * Sprint 29 amendment: enforces the centralized canStartTrading gate FIRST,
   * before any other check. This gate cannot be bypassed.
   *
   * @param userId - the authenticated user's ID
   * @param brokerConnectionId - optional specific broker connection
   * @param requestedMode - optional trading mode (defaults to PAPER_ONLY)
   */
  async startTradingSession(
    userId: string,
    brokerConnectionId?: string,
    requestedMode: AllowedTradingMode = AllowedTradingMode.PAPER_ONLY,
  ): Promise<TradingSession> {
    // ── Gate 1 (Sprint 29): Centralized onboarding readiness gate ────────────
    // This is the HARD gate — profile + risk acknowledgement + broker + kill
    // switch + user status. Cannot be bypassed. Returns structured 403 with
    // missingSteps so the frontend can direct the user to the right page.
    const readiness = await this.onboardingService.canStartTrading(userId);
    if (!readiness.allowed) {
      throw new TradingNotReadyException(readiness.missingSteps);
    }

    // ── Gate 2: Subscription check ────────────────────────────────────────────
    const canTrade = await this.subscriptionsService.canUserStartAiAutoTrading(userId);
    if (!canTrade) {
      throw new ForbiddenException(
        'You do not have an active subscription that allows AI Auto Trading.',
      );
    }

    // ── Gate 3: Resolve + verify broker connection health ─────────────────────
    const connection = await this.resolveConnection(userId, brokerConnectionId);
    this.assertBrokerConnectionHealthy(connection);

    // ── Gate 4: Requested trading mode must be permitted by risk profile ──────
    const riskProfile = await this.riskService.getOrCreateProfile(userId);
    this.assertRequestedModeAllowed(requestedMode, riskProfile.allowedTradingModes);

    // ── Gate 5: Live trading requires explicit broker enablement ──────────────
    // FULL_AUTO does NOT automatically enable live broker execution. The user
    // must separately enable live trading on the broker connection (a distinct
    // explicit action with its own audit trail).
    if (requestedMode === AllowedTradingMode.FULL_AUTO && !connection.liveTradingEnabled) {
      throw new ForbiddenException(
        'Live trading is not enabled on this broker connection. ' +
          'Enable live trading explicitly before requesting FULL_AUTO mode.',
      );
    }

    // ── Start session via ExecutionService ────────────────────────────────────
    const brokerState = await this.brokerService.getBrokerAccountState(connection.id);
    const openingBalance = brokerState?.balance ?? '0';

    // Sprint 32: snapshot the risk profile at session start so future edits
    // don't rewrite history. The snapshot is a deterministic JSON object of
    // risk-relevant fields (no credentials/secrets/PII).
    const riskProfileSnapshot = this.riskService.createRiskProfileSnapshot(riskProfile);

    const session = await this.executionService.startSession(
      userId,
      connection.id,
      openingBalance,
      riskProfileSnapshot,
    );

    await this.auditService.log({
      actorUserId: userId,
      action: AuditAction.AI_TRADING_ENABLED,
      severity: AuditSeverity.INFO,
      resourceType: 'TradingSession',
      resourceId: session.id,
      metadata: {
        brokerConnectionId: connection.id,
        openingBalance,
        sessionId: session.id,
        requestedMode,
        allowedTradingModes: riskProfile.allowedTradingModes,
      },
    });

    this.eventBus.publish(DomainEventType.TRADING_SESSION_STARTED, userId, {
      sessionId: session.id,
      userId,
      brokerConnectionId: connection.id,
      status: session.status,
      startedAt: session.startedAt,
    });

    this.logger.log(
      `Trading session started: userId=${userId} sessionId=${session.id} mode=${requestedMode}`,
    );

    // Notify AI engine scheduler (non-blocking — failures are logged only).
    // NOTE: the AI engine always runs in 'paper' mode from its perspective —
    // it generates signals that flow through the Risk Engine before reaching
    // the Execution Engine. AI never directly executes broker orders.
    // The requestedMode controls the user's intent, but the AI engine payload
    // is always 'paper' (the risk gate + execution service handle the actual
    // broker interaction based on the broker connection's liveTradingEnabled flag).
    void this.aiEngineClient
      .notifySessionStarted({
        userId,
        tradingSessionId: session.id,
        brokerConnectionId: connection.id,
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
        this.logger.warn(`AI engine stop notification failed session=${sessionId}: ${err.message}`),
      );
  }

  async getActiveSession(userId: string): Promise<TradingSession | null> {
    return this.executionService.getActiveSession(userId);
  }

  async getSessionById(userId: string, sessionId: string): Promise<TradingSession | null> {
    const session = await this.executionService.findSessionById(sessionId);
    if (!session || session.userId !== userId) return null;
    return session;
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Resolve the broker connection. If a specific ID is requested, load it and
   * verify ownership + CONNECTED status. Otherwise find the active connection.
   */
  private async resolveConnection(userId: string, requestedId?: string): Promise<BrokerConnection> {
    if (requestedId) {
      const conn = await this.brokerService.findConnectionById(requestedId, userId);
      if (!conn) {
        throw new ForbiddenException('Broker connection not found or does not belong to you.');
      }
      if (conn.status !== BrokerConnectionStatus.CONNECTED) {
        throw new ForbiddenException(
          `Broker connection is ${conn.status}, not CONNECTED. Connect it before starting a session.`,
        );
      }
      return conn;
    }

    const connection = await this.brokerService.findActiveConnectionForUser(userId);
    if (!connection) {
      throw new ForbiddenException('No active broker connection found.');
    }
    return connection;
  }

  /**
   * Assert the broker connection is healthy. A CONNECTED status alone is not
   * enough — the health check must be fresh (within BROKER_HEALTH_MAX_STALENESS_MS).
   *
   * Sprint 29 amendment: do not treat an old CONNECTED database status as
   * permanently healthy. If the last health check is stale or missing, reject
   * the start request and ask the user to test/reconnect.
   */
  private assertBrokerConnectionHealthy(connection: BrokerConnection): void {
    if (connection.consecutiveFailureCount >= 3) {
      throw new ForbiddenException(
        'Broker connection has repeated health-check failures. ' +
          'Test or reconnect your broker before starting a session.',
      );
    }

    if (!connection.lastHealthCheckAt) {
      throw new ForbiddenException(
        'Broker connection has no health check on record. ' +
          'Test your broker connection before starting a session.',
      );
    }

    const staleness = Date.now() - connection.lastHealthCheckAt.getTime();
    if (staleness > TradingService.BROKER_HEALTH_MAX_STALENESS_MS) {
      throw new ForbiddenException(
        'Broker health check is stale. Test your broker connection before starting a session.',
      );
    }
  }

  /**
   * Assert the requested trading mode is permitted by the user's risk profile.
   *
   * Rules:
   *   - PAPER_ONLY is always allowed (safest default).
   *   - SEMI_AUTO requires allowedTradingModes >= SEMI_AUTO.
   *   - FULL_AUTO requires allowedTradingModes == FULL_AUTO.
   *
   * FULL_AUTO does NOT automatically enable live broker execution — that
   * remains a separate explicit control (Gate 5).
   */
  private assertRequestedModeAllowed(
    requested: AllowedTradingMode,
    allowed: AllowedTradingMode,
  ): void {
    if (requested === AllowedTradingMode.PAPER_ONLY) {
      return; // always allowed
    }

    if (requested === AllowedTradingMode.SEMI_AUTO) {
      if (allowed === AllowedTradingMode.PAPER_ONLY) {
        throw new ForbiddenException(
          'Your risk profile only allows PAPER_ONLY mode. ' +
            'Update your risk profile to enable SEMI_AUTO.',
        );
      }
      return;
    }

    if (requested === AllowedTradingMode.FULL_AUTO) {
      if (allowed !== AllowedTradingMode.FULL_AUTO) {
        throw new ForbiddenException(
          'Your risk profile does not allow FULL_AUTO mode. ' +
            'Update your risk profile to enable FULL_AUTO.',
        );
      }
      return;
    }

    // Unknown mode — fail closed
    throw new ForbiddenException(`Unsupported trading mode: ${requested}`);
  }
}
