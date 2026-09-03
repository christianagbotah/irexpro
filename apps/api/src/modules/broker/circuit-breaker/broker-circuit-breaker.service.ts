import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrokerConnection } from '../entities/broker-connection.entity';
import { BrokerConnectionStatus } from '../interfaces/broker-adapter.interface';
import {
  BrokerAdapterError,
  BrokerErrorCode,
  RETRYABLE_BROKER_ERRORS,
} from '../interfaces/broker-adapter.errors';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../../common/enums/audit-action.enum';
import { AuditSeverity } from '../../audit/entities/audit-log.entity';

/**
 * Circuit state for a broker connection.
 *
 * - CLOSED:     Normal operation. Requests pass through. Failures are counted.
 * - OPEN:       Broker is considered down. ALL requests are rejected immediately
 *               without hitting the broker. After COOLDOWN_MS, transitions to HALF_OPEN.
 * - HALF_OPEN:  A single probe request is allowed. If it succeeds → CLOSED.
 *               If it fails → back to OPEN with an extended cooldown.
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: Date | null;
  lastFailureCode: BrokerErrorCode | null;
  openedAt: Date | null;
  cooldownUntil: Date | null;
  probeInFlight: boolean;
}

/**
 * BrokerCircuitBreakerService
 *
 * Per-connection circuit breaker that prevents cascading failures when a broker
 * is unreachable or erroring. This protects the execution path from wasting
 * time and resources on a known-down broker.
 *
 * ARCHITECTURE:
 * - In-memory state per connectionId (fast, no DB read on the hot path)
 * - State transitions are audit-logged
 * - Integrates with ExecutionService: check `canExecute()` before placing orders
 * - Integrates with health check: `recordSuccess()` / `recordFailure()` update state
 *
 * CONFIGURATION:
 * - FAILURE_THRESHOLD (5): failures before circuit opens
 * - COOLDOWN_MS (30s): initial cooldown after opening
 * - COOLDOWN_MAX_MS (5min): max cooldown after repeated failures
 * - COOLDOWN_MULTIPLIER (2): exponential backoff factor
 *
 * See: docs/architecture/09-broker-integration-architecture.md §8
 */
@Injectable()
export class BrokerCircuitBreakerService {
  private readonly logger = new Logger(BrokerCircuitBreakerService.name);

  private readonly FAILURE_THRESHOLD = 5;
  private readonly COOLDOWN_MS = 30_000;
  private readonly COOLDOWN_MAX_MS = 300_000;
  private readonly COOLDOWN_MULTIPLIER = 2;

  private readonly circuits = new Map<string, CircuitBreakerState>();

  constructor(
    @InjectRepository(BrokerConnection)
    private readonly connectionRepo: Repository<BrokerConnection>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Check if the circuit allows a request for the given connection.
   * Returns true if CLOSED or HALF_OPEN (probe allowed).
   * Returns false if OPEN and cooldown hasn't expired.
   *
   * If OPEN and cooldown HAS expired, transitions to HALF_OPEN and allows
   * a single probe request.
   */
  canExecute(connectionId: string): boolean {
    const circuit = this.getOrCreate(connectionId);

    if (circuit.state === 'CLOSED') {
      return true;
    }

    if (circuit.state === 'OPEN') {
      const now = new Date();
      if (circuit.cooldownUntil && circuit.cooldownUntil <= now) {
        // Cooldown expired — transition to HALF_OPEN
        circuit.state = 'HALF_OPEN';
        circuit.probeInFlight = false;
        this.logger.log(
          `[CircuitBreaker] ${connectionId}: OPEN → HALF_OPEN (cooldown expired, probing)`,
        );
        return true;
      }
      // Still in cooldown — reject immediately
      return false;
    }

    // HALF_OPEN: allow only one probe at a time
    if (circuit.state === 'HALF_OPEN') {
      if (circuit.probeInFlight) {
        // A probe is already in flight — reject concurrent probes
        return false;
      }
      circuit.probeInFlight = true;
      return true;
    }

    return false;
  }

  /**
   * Record a successful operation. Resets the circuit to CLOSED.
   */
  async recordSuccess(connectionId: string): Promise<void> {
    const circuit = this.getOrCreate(connectionId);
    const wasOpen = circuit.state !== 'CLOSED';

    circuit.state = 'CLOSED';
    circuit.failureCount = 0;
    circuit.lastFailureAt = null;
    circuit.lastFailureCode = null;
    circuit.openedAt = null;
    circuit.cooldownUntil = null;
    circuit.probeInFlight = false;

    if (wasOpen) {
      this.logger.log(`[CircuitBreaker] ${connectionId}: → CLOSED (recovered)`);
      // Update the DB connection status if it was SUSPENDED
      await this.connectionRepo.update(connectionId, {
        status: BrokerConnectionStatus.CONNECTED,
        consecutiveFailureCount: 0,
        lastErrorMessage: null,
      });
      await this.auditService.log({
        actorType: 'SYSTEM',
        action: AuditAction.BROKER_SUSPENDED_HEALTH_FAILURE,
        resourceType: 'BrokerConnection',
        resourceId: connectionId,
        metadata: { circuitBreaker: 'RECOVERED', state: 'CLOSED' },
        severity: AuditSeverity.INFO,
      });
    }
  }

  /**
   * Record a failed operation. Increments failure count and may open the circuit.
   *
   * @param connectionId  The broker connection that failed.
   * @param error         The error that occurred.
   * @returns true if the circuit transitioned to OPEN, false otherwise.
   */
  async recordFailure(connectionId: string, error: unknown): Promise<boolean> {
    const circuit = this.getOrCreate(connectionId);
    const errorCode = this.extractErrorCode(error);
    const isRetryable = errorCode !== null && RETRYABLE_BROKER_ERRORS.has(errorCode);

    circuit.failureCount++;
    circuit.lastFailureAt = new Date();
    circuit.lastFailureCode = errorCode;

    // If HALF_OPEN probe failed → back to OPEN with extended cooldown
    if (circuit.state === 'HALF_OPEN') {
      this.logger.warn(
        `[CircuitBreaker] ${connectionId}: HALF_OPEN → OPEN (probe failed: ${errorCode ?? 'UNKNOWN'})`,
      );
      await this.openCircuit(connectionId, circuit, error);
      return true;
    }

    // If CLOSED and threshold reached → open the circuit
    if (circuit.state === 'CLOSED' && circuit.failureCount >= this.FAILURE_THRESHOLD) {
      this.logger.warn(
        `[CircuitBreaker] ${connectionId}: CLOSED → OPEN (${circuit.failureCount} failures, last: ${errorCode ?? 'UNKNOWN'})`,
      );
      await this.openCircuit(connectionId, circuit, error);
      return true;
    }

    // Non-retryable errors (AUTHENTICATION_FAILED, etc.) open immediately
    if (circuit.state === 'CLOSED' && errorCode !== null && !isRetryable) {
      this.logger.warn(
        `[CircuitBreaker] ${connectionId}: CLOSED → OPEN (non-retryable error: ${errorCode})`,
      );
      await this.openCircuit(connectionId, circuit, error);
      return true;
    }

    this.logger.debug(
      `[CircuitBreaker] ${connectionId}: failure ${circuit.failureCount}/${this.FAILURE_THRESHOLD} (${errorCode ?? 'UNKNOWN'})`,
    );
    return false;
  }

  /**
   * Get the current circuit state for a connection (for observability/health checks).
   */
  getState(connectionId: string): CircuitState {
    const circuit = this.circuits.get(connectionId);
    return circuit?.state ?? 'CLOSED';
  }

  /**
   * Get full circuit details for a connection (for admin/observability endpoints).
   */
  getDetails(connectionId: string): {
    state: CircuitState;
    failureCount: number;
    lastFailureAt: Date | null;
    lastFailureCode: BrokerErrorCode | null;
    openedAt: Date | null;
    cooldownUntil: Date | null;
  } {
    const circuit = this.getOrCreate(connectionId);
    return {
      state: circuit.state,
      failureCount: circuit.failureCount,
      lastFailureAt: circuit.lastFailureAt,
      lastFailureCode: circuit.lastFailureCode,
      openedAt: circuit.openedAt,
      cooldownUntil: circuit.cooldownUntil,
    };
  }

  /**
   * Manually reset a circuit (admin override — e.g., after confirming broker is back).
   */
  async reset(connectionId: string): Promise<void> {
    const circuit = this.getOrCreate(connectionId);
    const wasOpen = circuit.state !== 'CLOSED';
    circuit.state = 'CLOSED';
    circuit.failureCount = 0;
    circuit.lastFailureAt = null;
    circuit.lastFailureCode = null;
    circuit.openedAt = null;
    circuit.cooldownUntil = null;
    circuit.probeInFlight = false;

    if (wasOpen) {
      this.logger.log(`[CircuitBreaker] ${connectionId}: manually reset to CLOSED`);
      await this.auditService.log({
        actorType: 'ADMIN',
        action: AuditAction.BROKER_SUSPENDED_HEALTH_FAILURE,
        resourceType: 'BrokerConnection',
        resourceId: connectionId,
        metadata: { circuitBreaker: 'MANUAL_RESET', state: 'CLOSED' },
        severity: AuditSeverity.WARNING,
      });
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private getOrCreate(connectionId: string): CircuitBreakerState {
    let circuit = this.circuits.get(connectionId);
    if (!circuit) {
      circuit = {
        state: 'CLOSED',
        failureCount: 0,
        lastFailureAt: null,
        lastFailureCode: null,
        openedAt: null,
        cooldownUntil: null,
        probeInFlight: false,
      };
      this.circuits.set(connectionId, circuit);
    }
    return circuit;
  }

  private async openCircuit(
    connectionId: string,
    circuit: CircuitBreakerState,
    error: unknown,
  ): Promise<void> {
    const now = new Date();
    const previousCooldown = circuit.cooldownUntil
      ? circuit.cooldownUntil.getTime() - (circuit.openedAt?.getTime() ?? now.getTime())
      : this.COOLDOWN_MS;
    const nextCooldown = Math.min(
      previousCooldown * this.COOLDOWN_MULTIPLIER,
      this.COOLDOWN_MAX_MS,
    );

    circuit.state = 'OPEN';
    circuit.openedAt = now;
    circuit.cooldownUntil = new Date(now.getTime() + nextCooldown);
    circuit.probeInFlight = false;

    // Suspend the connection in DB
    await this.connectionRepo.update(connectionId, {
      status: BrokerConnectionStatus.SUSPENDED,
      consecutiveFailureCount: circuit.failureCount,
      lastErrorMessage: (error as Error)?.message ?? 'Unknown error',
    });

    await this.auditService.log({
      actorType: 'SYSTEM',
      action: AuditAction.BROKER_SUSPENDED_HEALTH_FAILURE,
      resourceType: 'BrokerConnection',
      resourceId: connectionId,
      metadata: {
        circuitBreaker: 'OPENED',
        failureCount: circuit.failureCount,
        lastFailureCode: circuit.lastFailureCode,
        cooldownMs: nextCooldown,
        error: (error as Error)?.message ?? 'Unknown',
      },
      severity: AuditSeverity.WARNING,
    });
  }

  private extractErrorCode(error: unknown): BrokerErrorCode | null {
    if (error instanceof BrokerAdapterError) {
      return error.code;
    }
    return null;
  }
}
