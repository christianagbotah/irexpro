import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExecutionControl, ExecutionControlScope } from './entities/execution-control.entity';
import { ActivateExecutionControlDto } from './dto/activate-execution-control.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditSeverity } from '../audit/entities/audit-log.entity';
import { DomainEventBus } from '../events/event-bus.service';
import { DomainEventType } from '../events/enums/domain-event-type.enum';

/** Result of an execution-permission check (fail-closed). */
export interface ExecutionPermission {
  allowed: boolean;
  /** Present when blocked: the control that caused the denial. */
  blockedBy?: {
    scope: ExecutionControlScope;
    scopeKey: string | null;
    reason: string;
  };
}

/** Safe view of an active control (returned to admins). */
export interface ExecutionControlView {
  id: string;
  scope: ExecutionControlScope;
  scopeKey: string | null;
  reason: string;
  activatedByUserId: string;
  activatedAt: Date;
  expiresAt: Date | null;
}

/**
 * ExecutionControlService — server-side emergency control plane
 * (Directive §28).
 *
 * SEMANTICS
 * - A control row's PRESENCE disables execution at its scope. Clearing a
 *   control deletes the row. No "enabled/disabled" boolean to misread.
 * - Checks cascade: GLOBAL > PROVIDER > USER > BROKER_CONNECTION; the first
 *   active control wins and is reported.
 * - FAIL CLOSED (Directive §48): if the control store cannot be read, every
 *   check reports blocked with scope GLOBAL and reason
 *   'EXECUTION_CONTROL_STORE_UNAVAILABLE'. Execution is never permitted on
 *   an unreadable control plane.
 * - The control plane gates NEWLY SUBMITTED work immediately. Provider
 *   requests already in flight are resolved by the existing execution
 *   reconciliation path (uncertain-result handling) — documented in
 *   docs/brokers/execution-control-plane.md.
 */
@Injectable()
export class ExecutionControlService {
  private readonly logger = new Logger(ExecutionControlService.name);

  constructor(
    @InjectRepository(ExecutionControl)
    private readonly controlRepo: Repository<ExecutionControl>,
    private readonly auditService: AuditService,
    private readonly eventBus: DomainEventBus,
  ) {}

  // ─── Fail-closed permission checks ────────────────────────────────────────

  /**
   * Check whether execution is currently allowed for a user/connection.
   * NEVER throws — returns allowed:false on any internal failure.
   */
  async checkExecutionPermission(params: {
    userId: string;
    brokerId?: string;
    brokerConnectionId?: string;
  }): Promise<ExecutionPermission> {
    const { userId, brokerId, brokerConnectionId } = params;

    let controls: ExecutionControl[];
    try {
      controls = await this.findActiveControls();
    } catch (err) {
      // FAIL CLOSED — never permit execution when the control plane is unreadable
      this.logger.error(
        `Execution control store unavailable — failing closed: ${(err as Error).message}`,
      );
      return {
        allowed: false,
        blockedBy: {
          scope: ExecutionControlScope.GLOBAL,
          scopeKey: null,
          reason: 'EXECUTION_CONTROL_STORE_UNAVAILABLE',
        },
      };
    }

    // Cascade order: GLOBAL → PROVIDER → USER → BROKER_CONNECTION
    const global = this.matchScope(controls, ExecutionControlScope.GLOBAL, null);
    if (global) return { allowed: false, blockedBy: this.toBlock(global) };

    if (brokerId) {
      const provider = this.matchScope(controls, ExecutionControlScope.PROVIDER, brokerId);
      if (provider) return { allowed: false, blockedBy: this.toBlock(provider) };
    }

    const user = this.matchScope(controls, ExecutionControlScope.USER, userId);
    if (user) return { allowed: false, blockedBy: this.toBlock(user) };

    if (brokerConnectionId) {
      const conn = this.matchScope(
        controls,
        ExecutionControlScope.BROKER_CONNECTION,
        brokerConnectionId,
      );
      if (conn) return { allowed: false, blockedBy: this.toBlock(conn) };
    }

    return { allowed: true };
  }

  /** Throwing variant used by gatekeepers (risk pipeline, orchestrator). */
  async assertExecutionAllowed(params: {
    userId: string;
    brokerId?: string;
    brokerConnectionId?: string;
  }): Promise<void> {
    const permission = await this.checkExecutionPermission(params);
    if (!permission.allowed && permission.blockedBy) {
      throw new ForbiddenException(
        `Execution blocked by emergency control (scope=${permission.blockedBy.scope}` +
          `${permission.blockedBy.scopeKey ? `, key=${permission.blockedBy.scopeKey}` : ''}): ` +
          `${permission.blockedBy.reason}`,
      );
    }
  }

  // ─── Admin operations (RBAC enforced at controller) ──────────────────────

  /** List active (non-expired) controls. */
  async listActiveControls(): Promise<ExecutionControlView[]> {
    const controls = await this.findActiveControls();
    return controls.map((c) => ({
      id: c.id,
      scope: c.scope,
      scopeKey: c.scopeKey,
      reason: c.reason,
      activatedByUserId: c.activatedByUserId,
      activatedAt: c.activatedAt,
      expiresAt: c.expiresAt,
    }));
  }

  /**
   * Activate an emergency control. Idempotent per (scope, scopeKey):
   * activating an already-active control returns a ConflictException unless
   * the reason is being updated explicitly.
   */
  async activateControl(
    dto: ActivateExecutionControlDto,
    adminUserId: string,
    ipAddress?: string,
  ): Promise<ExecutionControlView> {
    const scopeKey = this.normalizeScopeKey(dto.scope, dto.scopeKey);

    const existing = await this.findActiveControl(dto.scope, scopeKey);
    if (existing) {
      throw new ConflictException(
        `Execution control already active for scope=${dto.scope}` +
          `${scopeKey ? ` key=${scopeKey}` : ''}`,
      );
    }

    const control = await this.controlRepo.save(
      this.controlRepo.create({
        scope: dto.scope,
        scopeKey,
        reason: dto.reason,
        activatedByUserId: adminUserId,
        activatedAt: new Date(),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      }),
    );

    await this.auditService.log({
      actorUserId: adminUserId,
      action: AuditAction.EXECUTION_CONTROL_ACTIVATED,
      resourceType: 'ExecutionControl',
      resourceId: control.id,
      ipAddress,
      metadata: {
        scope: dto.scope,
        scopeKey,
        reason: dto.reason,
        expiresAt: dto.expiresAt ?? null,
      },
      severity: AuditSeverity.CRITICAL,
    });

    this.publishControlEvent(adminUserId, control, 'activated');

    return this.toView(control);
  }

  /** Deactivate (clear) an emergency control by id. */
  async deactivateControl(
    controlId: string,
    adminUserId: string,
    ipAddress?: string,
  ): Promise<void> {
    const control = await this.controlRepo.findOne({ where: { id: controlId } });
    if (!control) {
      throw new NotFoundException(`Execution control ${controlId} not found`);
    }

    await this.controlRepo.delete(controlId);

    await this.auditService.log({
      actorUserId: adminUserId,
      action: AuditAction.EXECUTION_CONTROL_DEACTIVATED,
      resourceType: 'ExecutionControl',
      resourceId: controlId,
      ipAddress,
      metadata: {
        scope: control.scope,
        scopeKey: control.scopeKey,
        reason: control.reason,
      },
      severity: AuditSeverity.WARNING,
    });

    this.publishControlEvent(adminUserId, control, 'deactivated');
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private async findActiveControls(): Promise<ExecutionControl[]> {
    const now = new Date();
    const controls = await this.controlRepo.find();
    // Expired controls are ignored (lazily) — presence alone is not enough
    return controls.filter((c) => !c.expiresAt || c.expiresAt > now);
  }

  private async findActiveControl(
    scope: ExecutionControlScope,
    scopeKey: string | null,
  ): Promise<ExecutionControl | null> {
    const now = new Date();
    const where: Record<string, unknown> = { scope };
    if (scopeKey !== null) where.scopeKey = scopeKey;
    else where.scopeKey = null;
    const control = await this.controlRepo.findOne({ where });
    if (!control) return null;
    if (control.expiresAt && control.expiresAt <= now) return null;
    return control;
  }

  private matchScope(
    controls: ExecutionControl[],
    scope: ExecutionControlScope,
    key: string | null,
  ): ExecutionControl | null {
    const now = Date.now();
    return (
      controls.find(
        (c) =>
          c.scope === scope &&
          (key === null ? c.scopeKey === null : c.scopeKey === key) &&
          (!c.expiresAt || c.expiresAt.getTime() > now),
      ) ?? null
    );
  }

  private normalizeScopeKey(
    scope: ExecutionControlScope,
    scopeKey: string | null | undefined,
  ): string | null {
    if (scope === ExecutionControlScope.GLOBAL) return null;
    if (!scopeKey || scopeKey.trim().length === 0) {
      throw new ConflictException(`scopeKey is required for scope=${scope}`);
    }
    return scopeKey.trim();
  }

  private toBlock(c: ExecutionControl): ExecutionPermission['blockedBy'] {
    return { scope: c.scope, scopeKey: c.scopeKey, reason: c.reason };
  }

  private toView(c: ExecutionControl): ExecutionControlView {
    return {
      id: c.id,
      scope: c.scope,
      scopeKey: c.scopeKey,
      reason: c.reason,
      activatedByUserId: c.activatedByUserId,
      activatedAt: c.activatedAt,
      expiresAt: c.expiresAt,
    };
  }

  private publishControlEvent(
    adminUserId: string,
    control: ExecutionControl,
    action: 'activated' | 'deactivated',
  ): void {
    // Realtime consumers listen for control-plane changes (§28: immediate effect)
    this.eventBus.publish(DomainEventType.EXECUTION_CONTROL_CHANGED, adminUserId, {
      scope: control.scope,
      scopeKey: control.scopeKey,
      action,
      reason: control.reason,
    });
  }
}
