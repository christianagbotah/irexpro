import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * ExecutionControlScope — the level at which an emergency control applies
 * (Directive §28: GLOBAL / PROVIDER / USER / BROKER_CONNECTION).
 */
export enum ExecutionControlScope {
  GLOBAL = 'GLOBAL',
  PROVIDER = 'PROVIDER',
  USER = 'USER',
  BROKER_CONNECTION = 'BROKER_CONNECTION',
}

/**
 * ExecutionControl — server-side emergency control plane record.
 *
 * PRESENCE = EXECUTION DISABLED at the given scope. A control is removed
 * (row deleted) when cleared — there is no "enabled" row to misinterpret.
 *
 * SECURITY INVARIANTS:
 * - Effective authorization FAILS CLOSED: when the control store cannot be
 *   queried (DB error), execution is treated as disabled.
 * - The control plane affects newly submitted work IMMEDIATELY; in-flight
 *   provider requests are documented in the runbook (see
 *   docs/brokers/execution-control-plane.md).
 * - Only ADMIN / SUPER_ADMIN may activate or clear controls (RBAC enforced
 *   in the controller); every change is audited.
 */
@Entity({ name: 'execution_controls', schema: 'platform' })
@Index('idx_exec_controls_scope_key', ['scope', 'scopeKey'])
export class ExecutionControl {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Control level (see ExecutionControlScope). */
  @Column({ type: 'varchar', length: 20 })
  scope: ExecutionControlScope;

  /**
   * Scope key: null for GLOBAL; brokerId for PROVIDER; userId for USER;
   * brokerConnectionId for BROKER_CONNECTION.
   */
  @Column({ name: 'scope_key', type: 'varchar', length: 100, nullable: true })
  scopeKey: string | null;

  /** Admin-provided human-readable reason (audited, never a secret). */
  @Column({ type: 'varchar', length: 500 })
  reason: string;

  /** Admin who activated the control. */
  @Column({ name: 'activated_by_user_id', type: 'uuid' })
  activatedByUserId: string;

  @Column({ name: 'activated_at', type: 'timestamptz' })
  activatedAt: Date;

  /**
   * Optional automatic expiry (e.g. maintenance windows). Expired controls
   * are ignored by isExecutionDisabled and cleaned up lazily.
   */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
