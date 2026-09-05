import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { BrokerConnection } from '../../broker/entities/broker-connection.entity';
import { BrokerService } from '../../broker/broker.service';
import { BrokerAdapterRegistry } from '../../broker/adapters/broker-adapter.registry';
import { CredentialEncryptionService } from '../../broker/services/credential-encryption.service';
import {
  BrokerMode,
  BrokerOrderRequest,
  BrokerOrderResult,
} from '../../broker/interfaces/broker-adapter.interface';
import { RETRYABLE_BROKER_ERRORS } from '../../broker/interfaces/broker-adapter.errors';
import { ExecutionControlService } from '../../execution-control/execution-control.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../../common/enums/audit-action.enum';
import { AuditSeverity } from '../../audit/entities/audit-log.entity';
import { DomainEventBus } from '../../events/event-bus.service';
import { DomainEventType } from '../../events/enums/domain-event-type.enum';
import { OrderEventPayload } from '../../events/interfaces/domain-event.interface';
import { Order } from '../orders/order.entity';
import { OrderService } from '../orders/order.service';
import { OrderStatus } from '../orders/order.enums';
import { ExecutionIntent, ProviderDispatchOutcome } from './execution-intent.interface';
import { mapProviderOrderResponse } from './provider-response.mapper';

const EXECUTION_TIMEOUT_MS = 10_000;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1_000, 3_000, 9_000];

/**
 * ExecutionOrchestrator — Directive PHASE D "execution foundation".
 *
 * Owns the provider-dispatch slice of the execution pipeline:
 *
 *   1. VALIDATION PIPELINE (assertDispatchable) — fail-closed pre-dispatch
 *      gates, defense-in-depth against TOCTOU between risk approval and
 *      dispatch:
 *        a. Emergency control plane (GLOBAL → PROVIDER → USER → CONNECTION)
 *        b. LIVE authorization state machine (only ACTIVE is executable)
 *   2. IDEMPOTENCY (dispatchOrder) — every dispatch is preceded by an
 *      idempotent order reservation (OrderService.submitOrder). A duplicate
 *      clientOrderId NEVER re-dispatches to the provider.
 *   3. PROVIDER DISPATCH — retry/timeout-wrapped adapter call with
 *      credentials zeroed from memory immediately after connect.
 *   4. RESPONSE HANDLING — the pure mapProviderOrderResponse() decides the
 *      order-domain action (ack / fill / reject / reconcile).
 *   5. STATE TRANSITIONS — every order mutation passes through
 *      OrderStateMachine-guarded OrderService methods; order.* events and
 *      ORDER_* audit entries are emitted at each transition.
 *
 * The Risk Engine APPROVED gate lives UPSTREAM (ExecutionService.executeTrade)
 * and is never bypassed: dispatchOrder is only reachable with an approved,
 * reserved trade slot.
 *
 * See: docs/orders/order-domain.md, docs/architecture/12-execution-engine-architecture.md
 */
@Injectable()
export class ExecutionOrchestrator {
  private readonly logger = new Logger(ExecutionOrchestrator.name);

  constructor(
    private readonly orderService: OrderService,
    private readonly brokerService: BrokerService,
    private readonly executionControlService: ExecutionControlService,
    private readonly adapterRegistry: BrokerAdapterRegistry,
    private readonly encryptionService: CredentialEncryptionService,
    private readonly auditService: AuditService,
    private readonly eventBus: DomainEventBus,
  ) {}

  // ─── 1. Validation pipeline (fail-closed) ───────────────────────────────

  /**
   * Assert that a dispatch is permitted for this user + connection.
   * Throws ForbiddenException when any gate blocks — BEFORE any order is
   * persisted or any provider is contacted.
   *
   * Gate A — emergency control plane: matches the Risk Engine's step 1a-pre
   * check, closing the TOCTOU window between risk approval and dispatch.
   * Gate B — LIVE authorization: a LIVE connection must be ACTIVE in the
   * BrokerAuthorizationStateMachine (fail-closed via isConnectionExecutable).
   * DEMO/PAPER connections pass Gate B (mirrors RiskService step 1c).
   */
  async assertDispatchable(ctx: { userId: string; connection: BrokerConnection }): Promise<void> {
    // ── Gate A: emergency control plane (fail-closed on store errors) ──────
    const permission = await this.executionControlService.checkExecutionPermission({
      userId: ctx.userId,
      brokerId: ctx.connection.brokerId,
      brokerConnectionId: ctx.connection.id,
    });
    if (!permission.allowed) {
      const blocked = permission.blockedBy;
      this.logger.warn(
        `Dispatch blocked by execution control plane for user ${ctx.userId} ` +
          `(scope: ${blocked?.scope ?? 'UNKNOWN'}, reason: ${blocked?.reason ?? 'UNKNOWN'})`,
      );
      await this.auditService.log({
        actorUserId: ctx.userId,
        action: AuditAction.ORDER_REJECTED,
        resourceType: 'Order',
        resourceId: 'not-dispatched',
        metadata: {
          reason: 'EXECUTION_CONTROL_BLOCKED',
          controlScope: blocked?.scope ?? 'UNKNOWN',
          controlScopeKey: blocked?.scopeKey ?? null,
          brokerConnectionId: ctx.connection.id,
        },
        severity: AuditSeverity.WARNING,
      });
      throw new ForbiddenException(
        `Execution blocked by platform control plane (${blocked?.scope ?? 'UNKNOWN'} scope).`,
      );
    }

    // ── Gate B: LIVE authorization state machine (fail-closed) ────────────
    if (
      ctx.connection.accountType === BrokerMode.LIVE &&
      !this.brokerService.isConnectionExecutable(ctx.connection)
    ) {
      this.logger.warn(
        `Dispatch blocked: LIVE connection ${ctx.connection.id} is not executable ` +
          `(authorizationStatus: ${ctx.connection.authorizationStatus ?? 'UNKNOWN'})`,
      );
      await this.auditService.log({
        actorUserId: ctx.userId,
        action: AuditAction.ORDER_REJECTED,
        resourceType: 'Order',
        resourceId: 'not-dispatched',
        metadata: {
          reason: 'LIVE_AUTHORIZATION_REQUIRED',
          authorizationStatus: ctx.connection.authorizationStatus ?? 'UNKNOWN',
          brokerConnectionId: ctx.connection.id,
        },
        severity: AuditSeverity.WARNING,
      });
      throw new ForbiddenException(
        'Live account is not authorized for execution (authorization state is not ACTIVE).',
      );
    }
  }

  // ─── 2-5. Idempotent dispatch + response handling + transitions ─────────

  /**
   * Orchestrate ONE provider dispatch for the given intent:
   * reserve (idempotent) → submit → dispatch → map response → transition.
   *
   * Guarantees:
   * - exactly-once dispatch per clientOrderId (duplicates return DUPLICATE)
   * - every outcome is durably recorded on the order before returning
   * - UNKNOWN outcomes leave the order RECONCILIATION_PENDING (fail-closed)
   */
  async dispatchOrder(
    intent: ExecutionIntent,
    connection: BrokerConnection,
  ): Promise<ProviderDispatchOutcome> {
    // ── Idempotent reservation ────────────────────────────────────────────
    const submission = await this.orderService.submitOrder({
      userId: intent.userId,
      brokerConnectionId: intent.brokerConnectionId,
      clientOrderId: intent.clientOrderId,
      orderKind: intent.orderKind,
      timeInForce: intent.timeInForce,
      instrument: intent.instrument,
      direction: intent.direction,
      requestedQuantity: intent.requestedQuantity,
      requestedPrice: intent.requestedPrice ?? null,
      stopPrice: intent.stopPrice ?? null,
      signalId: intent.signalId ?? null,
      tradeId: intent.tradeId ?? null,
    });

    if (submission.status === 'DUPLICATE_EXISTING') {
      // Exactly-once dispatch guarantee: NEVER re-dispatch a duplicate.
      this.logger.warn(
        `Duplicate order submission suppressed (clientOrderId=${intent.clientOrderId}) — ` +
          `no provider dispatch for existing order ${submission.order.id}`,
      );
      await this.auditService.log({
        actorUserId: intent.userId,
        action: AuditAction.ORDER_DUPLICATE_SUPPRESSED,
        resourceType: 'Order',
        resourceId: submission.order.id,
        metadata: {
          clientOrderId: intent.clientOrderId,
          existingStatus: submission.order.status,
          tradeId: intent.tradeId ?? null,
          signalId: intent.signalId ?? null,
        },
        severity: AuditSeverity.WARNING,
      });
      return { outcome: 'DUPLICATE', order: submission.order, orderId: submission.order.id };
    }

    let order = submission.order;

    // ── SUBMITTED: we are about to contact the provider ───────────────────
    order = await this.orderService.markSubmitted(order.id);
    await this.emitOrderEvent(DomainEventType.ORDER_SUBMITTED, intent, order, {
      status: OrderStatus.SUBMITTED,
    });
    await this.auditService.log({
      actorUserId: intent.userId,
      action: AuditAction.ORDER_SUBMITTED,
      resourceType: 'Order',
      resourceId: order.id,
      metadata: {
        clientOrderId: intent.clientOrderId,
        providerAction: intent.providerAction,
        instrument: intent.instrument,
        direction: intent.direction,
        orderKind: intent.orderKind,
        timeInForce: intent.timeInForce,
        requestedQuantity: intent.requestedQuantity,
        tradeId: intent.tradeId ?? null,
        signalId: intent.signalId ?? null,
      },
    });

    // ── Provider dispatch (retry/timeout-wrapped) ─────────────────────────
    try {
      const result = await this.dispatchToProvider(intent, connection);
      const action = mapProviderOrderResponse(result);

      switch (action.action) {
        case 'ACKNOWLEDGE_AND_FILL': {
          if (action.providerOrderId) {
            order = await this.orderService.markAcknowledged(order.id, action.providerOrderId);
            await this.emitAcknowledged(intent, order, action.providerOrderId);
          }
          const filled = await this.orderService.applyFill(order.id, {
            quantity: action.fillQuantity ?? intent.requestedQuantity,
            price: action.fillPrice,
            providerOrderId: action.providerOrderId ?? null,
          });
          await this.emitOrderEvent(DomainEventType.ORDER_FILLED, intent, filled, {
            status: filled.status,
            filledQuantity: filled.filledQuantity,
            avgFillPrice: filled.avgFillPrice ?? action.fillPrice,
          });
          await this.auditService.log({
            actorUserId: intent.userId,
            action: AuditAction.ORDER_FILLED,
            resourceType: 'Order',
            resourceId: filled.id,
            metadata: {
              clientOrderId: intent.clientOrderId,
              providerOrderId: filled.providerOrderId ?? null,
              filledQuantity: filled.filledQuantity,
              avgFillPrice: filled.avgFillPrice,
              orderStatus: filled.status,
            },
          });
          return {
            outcome: 'FILLED',
            order: filled,
            orderId: filled.id,
            providerOrderId: filled.providerOrderId ?? action.providerOrderId ?? '',
            filledQuantity: filled.filledQuantity,
            avgFillPrice: filled.avgFillPrice ?? action.fillPrice,
          };
        }

        case 'ACKNOWLEDGE': {
          order = await this.orderService.markAcknowledged(order.id, action.providerOrderId);
          await this.emitAcknowledged(intent, order, action.providerOrderId);
          return {
            outcome: 'WORKING',
            order,
            orderId: order.id,
            providerOrderId: action.providerOrderId,
          };
        }

        case 'REJECT': {
          order = await this.orderService.rejectOrder(order.id, action.reason);
          await this.emitOrderEvent(DomainEventType.ORDER_REJECTED, intent, order, {
            status: OrderStatus.REJECTED,
            reason: action.reason,
          });
          await this.auditService.log({
            actorUserId: intent.userId,
            action: AuditAction.ORDER_REJECTED,
            resourceType: 'Order',
            resourceId: order.id,
            metadata: {
              clientOrderId: intent.clientOrderId,
              reason: action.reason,
              orderStatus: OrderStatus.REJECTED,
            },
            severity: AuditSeverity.WARNING,
          });
          return { outcome: 'REJECTED', order, orderId: order.id, reason: action.reason };
        }

        case 'RECONCILIATION_PENDING': {
          order = await this.orderService.markReconciliationPending(order.id);
          await this.emitOrderEvent(DomainEventType.ORDER_RECONCILIATION_PENDING, intent, order, {
            status: OrderStatus.RECONCILIATION_PENDING,
            reason: action.reason,
          });
          await this.auditService.log({
            actorUserId: intent.userId,
            action: AuditAction.ORDER_RECONCILIATION_PENDING,
            resourceType: 'Order',
            resourceId: order.id,
            metadata: {
              clientOrderId: intent.clientOrderId,
              reason: action.reason,
              orderStatus: OrderStatus.RECONCILIATION_PENDING,
            },
            severity: AuditSeverity.CRITICAL,
          });
          return { outcome: 'UNKNOWN', order, orderId: order.id, reason: action.reason };
        }
      }
    } catch (err) {
      // ── UNKNOWN outcome: provider outcome cannot be determined ─────────
      const message = (err as Error).message ?? 'Unknown dispatch error';
      this.logger.error(
        `Provider dispatch error for order ${order.id} (clientOrderId=${intent.clientOrderId}): ${message}`,
        (err as Error).stack,
      );
      try {
        order = await this.orderService.markReconciliationPending(order.id);
        await this.emitOrderEvent(DomainEventType.ORDER_RECONCILIATION_PENDING, intent, order, {
          status: OrderStatus.RECONCILIATION_PENDING,
          reason: message,
        });
        await this.auditService.log({
          actorUserId: intent.userId,
          action: AuditAction.ORDER_RECONCILIATION_PENDING,
          resourceType: 'Order',
          resourceId: order.id,
          metadata: {
            clientOrderId: intent.clientOrderId,
            reason: `Dispatch error: ${message}`,
            orderStatus: OrderStatus.RECONCILIATION_PENDING,
          },
          severity: AuditSeverity.CRITICAL,
        });
      } catch (transitionErr) {
        // The order row may already have moved (e.g. a terminal state won in a
        // concurrent race) — the error is logged, never swallowed silently.
        this.logger.error(
          `Could not move order ${order.id} to RECONCILIATION_PENDING: ${(transitionErr as Error).message}`,
        );
      }
      return { outcome: 'UNKNOWN', order, orderId: order.id, reason: message };
    }
  }

  // ─── Provider dispatch mechanics ────────────────────────────────────────

  /**
   * Connect the provider adapter and perform the intent's provider action
   * with retry + timeout. Credentials are decrypted in-memory, used for the
   * connect handshake, and zeroed immediately afterwards.
   */
  private async dispatchToProvider(
    intent: ExecutionIntent,
    connection: BrokerConnection,
  ): Promise<BrokerOrderResult> {
    const credentials = this.encryptionService.decrypt({
      ciphertext: connection.encryptedCredentials!,
      iv: connection.credentialIv!,
      tag: connection.credentialTag!,
      keyId: connection.encryptionKeyId!,
    });

    const adapter = this.adapterRegistry.getAdapter(connection.brokerId);
    adapter.setMode(connection.accountType);
    await adapter.connect(credentials);
    const connectionReference = credentials.accountId;

    // Zero credentials from memory immediately after connection
    (Object.keys(credentials) as (keyof typeof credentials)[]).forEach((k) => {
      (credentials as unknown as Record<string, unknown>)[k] = null;
    });

    const execute = async (): Promise<BrokerOrderResult> => {
      if (intent.providerAction === 'CLOSE_POSITION') {
        if (!intent.providerReferenceId) {
          throw new Error('CLOSE_POSITION intent requires providerReferenceId');
        }
        return adapter.closeOrder(intent.providerReferenceId, intent.requestedQuantity);
      }
      const request: BrokerOrderRequest = {
        idempotencyKey: this.orderIdempotencyKey(intent),
        instrument: intent.instrument,
        direction: intent.direction,
        lotSize: intent.requestedQuantity,
        stopLoss: intent.stopLoss,
        takeProfit: intent.takeProfit,
        comment: intent.comment,
        connectionReference,
        orderKind: intent.orderKind,
        timeInForce: intent.timeInForce,
        limitPrice: intent.requestedPrice ?? undefined,
        stopPrice: intent.stopPrice ?? undefined,
        clientOrderId: intent.clientOrderId,
      };
      return adapter.placeOrder(request);
    };

    return this.withRetry(execute);
  }

  /**
   * Retry/timeout wrapper for provider calls (unchanged semantics from the
   * Sprint 32 ExecutionService implementation): 3 attempts, 10s timeout,
   * exponential-ish backoff, only RETRYABLE_BROKER_ERRORS retry.
   *
   * `call` is a FACTORY — each attempt invokes it afresh (never re-await a
   * settled promise).
   */
  private async withRetry(call: () => Promise<BrokerOrderResult>): Promise<BrokerOrderResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const result = await Promise.race([
          call(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Broker order timeout')), EXECUTION_TIMEOUT_MS),
          ),
        ]);
        return result;
      } catch (err) {
        lastError = err as Error;

        const isRetryable =
          err instanceof Error &&
          'errorCode' in err &&
          RETRYABLE_BROKER_ERRORS.has((err as { errorCode: string }).errorCode as never);

        if (!isRetryable || attempt === MAX_RETRY_ATTEMPTS - 1) {
          throw err;
        }

        const delay = RETRY_DELAYS_MS[attempt] ?? 9_000;
        this.logger.warn(
          `Broker order attempt ${attempt + 1} failed (${lastError.message}) — retrying in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw lastError ?? new Error('All retry attempts exhausted');
  }

  // ─── Event + audit helpers ──────────────────────────────────────────────

  private orderIdempotencyKey(intent: ExecutionIntent): string {
    const key = this.orderService.generateIdempotencyKey(intent.userId, intent.clientOrderId);
    return key;
  }

  private async emitAcknowledged(
    intent: ExecutionIntent,
    order: Order,
    providerOrderId: string,
  ): Promise<void> {
    await this.emitOrderEvent(DomainEventType.ORDER_ACKNOWLEDGED, intent, order, {
      status: OrderStatus.ACKNOWLEDGED,
      providerOrderId,
    });
    await this.auditService.log({
      actorUserId: intent.userId,
      action: AuditAction.ORDER_ACKNOWLEDGED,
      resourceType: 'Order',
      resourceId: order.id,
      metadata: {
        clientOrderId: intent.clientOrderId,
        providerOrderId,
        orderStatus: OrderStatus.ACKNOWLEDGED,
      },
    });
  }

  private async emitOrderEvent(
    type: DomainEventType,
    intent: ExecutionIntent,
    order: Order,
    extras: {
      status: string;
      filledQuantity?: string;
      avgFillPrice?: string;
      providerOrderId?: string | null;
      reason?: string;
    },
  ): Promise<void> {
    const payload: OrderEventPayload = {
      orderId: order.id,
      userId: intent.userId,
      clientOrderId: intent.clientOrderId,
      tradeId: intent.tradeId ?? null,
      signalId: intent.signalId ?? null,
      instrument: intent.instrument,
      direction: intent.direction,
      orderKind: intent.orderKind,
      status: extras.status,
      requestedQuantity: intent.requestedQuantity,
      filledQuantity: extras.filledQuantity,
      avgFillPrice: extras.avgFillPrice,
      providerOrderId: extras.providerOrderId ?? null,
      reason: extras.reason,
    };
    this.eventBus.publish(type, intent.userId, payload as unknown as Record<string, unknown>);
  }
}
