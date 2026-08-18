import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { RiskService } from '../risk/risk.service';
import { ExecutionService } from '../execution/execution.service';
import { BrokerService } from '../broker/broker.service';
import { AuditService } from '../audit/audit.service';
import { DomainEventBus } from '../events/event-bus.service';
import { DomainEventType } from '../events/enums/domain-event-type.enum';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditSeverity } from '../audit/entities/audit-log.entity';
import { TradingSessionStatus } from '../execution/entities/trading-session.entity';
import { ProposedTrade } from '../risk/interfaces/risk.interface';
import {
  AiSignalCandidate,
  StrategyOutcome,
  StrategyResult,
} from './interfaces/strategy.interface';

/** Minimum confidence score required for a signal to proceed. */
const CONFIDENCE_THRESHOLD = 0.6;

/**
 * StrategyOrchestratorService — Routes AI signal candidates through the
 * full validation pipeline before execution.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * MANDATORY PIPELINE — NEVER BYPASS:
 *   AiSignalCandidate
 *     → validate structure
 *     → confidence threshold
 *     → session active check
 *     → broker connection gate
 *     → RiskService.validateProposedTrade()  ← MANDATORY
 *     → ExecutionService.executeTrade()       ← only on APPROVED
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Subscription/payment state is intentionally NOT part of this pipeline.
 * Users may trade without a paid plan; monetization is handled separately
 * from realised performance.
 *
 * There is NO direct path from signal to broker adapter.
 * The Risk Engine is always invoked before ExecutionService.
 *
 * See: docs/architecture/10-ai-trading-architecture.md
 */
@Injectable()
export class StrategyOrchestratorService {
  private readonly logger = new Logger(StrategyOrchestratorService.name);

  constructor(
    private readonly riskService: RiskService,
    @Inject(forwardRef(() => ExecutionService))
    private readonly executionService: ExecutionService,
    private readonly brokerService: BrokerService,
    private readonly auditService: AuditService,
    private readonly eventBus: DomainEventBus,
  ) {}

  /**
   * Process an AI signal candidate through the full validation pipeline.
   *
   * Returns a StrategyResult describing what happened at each gate.
   * Any gate failure stops processing immediately (fail-closed behavior).
   */
  async processSignal(candidate: AiSignalCandidate): Promise<StrategyResult> {
    const { signalId, userId } = candidate;
    this.logger.log(
      `Processing signal ${signalId} for user=${userId} instrument=${candidate.instrument}`,
    );

    // ── Gate 1: Validate signal structure ─────────────────────────────────────
    const structureError = this.validateStructure(candidate);
    if (structureError) {
      this.logger.warn(`Signal ${signalId} rejected: invalid structure — ${structureError}`);
      this.publishIgnored(candidate, structureError);
      return { outcome: 'SIGNAL_INVALID', signalId, reason: structureError };
    }

    // ── Gate 2: Confidence threshold ──────────────────────────────────────────
    if (candidate.confidenceScore < CONFIDENCE_THRESHOLD) {
      const reason = `Confidence ${candidate.confidenceScore} below threshold ${CONFIDENCE_THRESHOLD}`;
      this.logger.log(`Signal ${signalId} ignored: ${reason}`);
      this.publishIgnored(candidate, reason);
      return { outcome: 'LOW_CONFIDENCE', signalId, reason };
    }

    // ── Gate 3: Trading session active ────────────────────────────────────────
    try {
      const session = await this.executionService.getActiveSession(userId);
      if (!session || session.status !== TradingSessionStatus.ACTIVE) {
        const reason = 'No active trading session';
        this.logger.warn(`Signal ${signalId} rejected: ${reason}`);
        this.publishIgnored(candidate, reason);
        return { outcome: 'SESSION_INACTIVE', signalId, reason };
      }
      if (session.id !== candidate.tradingSessionId) {
        const reason = `Signal session ${candidate.tradingSessionId} does not match active session ${session.id}`;
        this.logger.warn(`Signal ${signalId} rejected: ${reason}`);
        this.publishIgnored(candidate, reason);
        return { outcome: 'SESSION_INACTIVE', signalId, reason };
      }
    } catch (err) {
      const reason = 'Failed to verify trading session';
      this.logger.error(`Signal ${signalId}: session check error`, (err as Error).message);
      this.publishIgnored(candidate, reason);
      return { outcome: 'SESSION_INACTIVE', signalId, reason };
    }

    // ── Gate 4: Broker connection active ──────────────────────────────────────
    try {
      const hasBroker = await this.brokerService.hasActiveConnection(userId);
      if (!hasBroker) {
        const reason = 'No active broker connection';
        this.logger.warn(`Signal ${signalId} rejected: ${reason}`);
        this.publishIgnored(candidate, reason);
        return { outcome: 'NO_BROKER_CONNECTION', signalId, reason };
      }
    } catch (err) {
      const reason = 'Failed to verify broker connection';
      this.logger.error(`Signal ${signalId}: broker check error`, (err as Error).message);
      this.publishIgnored(candidate, reason);
      return { outcome: 'NO_BROKER_CONNECTION', signalId, reason };
    }

    // ── Build ProposedTrade ────────────────────────────────────────────────────
    const proposedTrade: ProposedTrade = {
      signalId: candidate.signalId,
      instrument: candidate.instrument,
      direction: candidate.direction,
      requestedLotSize: String(candidate.suggestedVolume),
      entryPrice:
        candidate.suggestedEntryPrice != null ? String(candidate.suggestedEntryPrice) : '0',
      stopLoss: String(candidate.suggestedStopLoss),
      takeProfit: String(candidate.suggestedTakeProfit),
      idempotencyKey: `${candidate.userId}:${candidate.signalId}`,
      volatilityScore: candidate.volatilityScore,
    };

    // ── Gate 5: Risk Engine ────────────────────────────────────────────────────
    let riskDecision;
    try {
      riskDecision = await this.riskService.validateProposedTrade(userId, proposedTrade);
    } catch (err) {
      const reason = 'Risk Engine error — trade rejected (fail-closed)';
      this.logger.error(`Signal ${signalId}: risk engine exception`, (err as Error).message);
      this.eventBus.publish(DomainEventType.RISK_SIGNAL_REJECTED, userId, {
        userId,
        instrument: candidate.instrument,
        direction: candidate.direction,
        decision: 'REJECTED',
        rejectionCode: 'RISK_ENGINE_ERROR',
        rejectionReason: reason,
      });
      return { outcome: 'RISK_REJECTED', signalId, reason };
    }

    if (riskDecision.decision !== 'APPROVED') {
      const outcome: StrategyOutcome =
        riskDecision.decision === 'SUSPENDED' ? 'RISK_SUSPENDED' : 'RISK_REJECTED';
      this.logger.warn(
        `Signal ${signalId} RISK ${riskDecision.decision}: ${riskDecision.rejectionCode}`,
      );
      await this.auditService.log({
        actorUserId: userId,
        action: AuditAction.AI_SIGNAL_RISK_REJECTED,
        severity: AuditSeverity.WARNING,
        resourceType: 'AiSignal',
        resourceId: signalId,
        metadata: {
          instrument: candidate.instrument,
          direction: candidate.direction,
          rejectionCode: riskDecision.rejectionCode,
          rejectionReason: riskDecision.rejectionReason,
        },
      });
      return {
        outcome,
        signalId,
        reason: `${riskDecision.rejectionCode}: ${riskDecision.rejectionReason}`,
      };
    }

    // ── Gate 6: Execution ──────────────────────────────────────────────────────
    try {
      const trade = await this.executionService.executeTrade(userId, riskDecision);
      this.logger.log(`Signal ${signalId} executed: tradeId=${trade.id} status=${trade.status}`);
      await this.auditService.log({
        actorUserId: userId,
        action: AuditAction.AI_SIGNAL_EXECUTED,
        severity: AuditSeverity.INFO,
        resourceType: 'Trade',
        resourceId: trade.id,
        metadata: {
          signalId,
          instrument: candidate.instrument,
          direction: candidate.direction,
          strategyCode: candidate.strategyCode,
        },
      });
      return { outcome: 'EXECUTION_SUCCEEDED', signalId, tradeId: trade.id };
    } catch (err) {
      const reason = `Execution failed: ${(err as Error).message}`;
      this.logger.error(`Signal ${signalId} execution error`, (err as Error).message);
      await this.auditService.log({
        actorUserId: userId,
        action: AuditAction.AI_SIGNAL_EXECUTION_FAILED,
        severity: AuditSeverity.CRITICAL,
        resourceType: 'AiSignal',
        resourceId: signalId,
        metadata: {
          instrument: candidate.instrument,
          direction: candidate.direction,
          error: (err as Error).message,
        },
      });
      return { outcome: 'EXECUTION_FAILED', signalId, reason };
    }
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  private validateStructure(candidate: AiSignalCandidate): string | null {
    if (!candidate.signalId) return 'Missing signalId';
    if (!candidate.userId) return 'Missing userId';
    if (!candidate.tradingSessionId) return 'Missing tradingSessionId';
    if (!candidate.brokerConnectionId) return 'Missing brokerConnectionId';
    if (!candidate.instrument) return 'Missing instrument';
    if (!['BUY', 'SELL'].includes(candidate.direction)) return 'Invalid direction';
    if (typeof candidate.confidenceScore !== 'number') return 'Invalid confidenceScore';
    if (!candidate.suggestedStopLoss) return 'Missing suggestedStopLoss';
    if (!candidate.suggestedTakeProfit) return 'Missing suggestedTakeProfit';
    if (!candidate.suggestedVolume || candidate.suggestedVolume <= 0)
      return 'Invalid suggestedVolume';
    return null;
  }

  private publishIgnored(candidate: AiSignalCandidate, reason: string): void {
    this.eventBus.publish(DomainEventType.AI_SIGNAL_IGNORED, candidate.userId, {
      signalId: candidate.signalId,
      instrument: candidate.instrument,
      direction: candidate.direction,
      confidenceScore: candidate.confidenceScore,
      strategyCode: candidate.strategyCode,
      ignoredReason: reason,
    });
  }
}
