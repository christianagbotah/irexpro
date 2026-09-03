import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * EmergencyShutdownEvent
 *
 * Immutable audit record of a platform-wide emergency shutdown.
 * When active=true, ALL trading is halted:
 * - Risk Engine rejects every signal immediately
 * - Execution Engine refuses new orders
 * - All open positions are force-closed
 *
 * This is DISTINCT from the per-user kill switch (RiskProfile.killSwitchActive).
 * The global emergency shutdown affects every user, every broker connection,
 * and every open position on the platform.
 *
 * INVARIANTS:
 * - Only one event may be active at a time
 * - Activation requires admin SUPER_ADMIN role
 * - Every activation/deactivation is audit-logged
 * - The event is immutable once created (only deactivated, never deleted)
 */
@Entity({ name: 'emergency_shutdown_events', schema: 'platform' })
@Index(['isActive'])
@Index(['activatedAt'])
export class EmergencyShutdownEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** When true, the platform is in emergency shutdown mode. */
  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive: boolean;

  /** The admin who activated the shutdown. */
  @Column({ name: 'activated_by', type: 'uuid' })
  activatedBy: string;

  @Column({ name: 'activated_at', type: 'timestamptz' })
  activatedAt: Date;

  /** The admin who deactivated the shutdown (null while active). */
  @Column({ name: 'deactivated_by', type: 'uuid', nullable: true })
  deactivatedBy: string | null;

  @Column({ name: 'deactivated_at', type: 'timestamptz', nullable: true })
  deactivatedAt: Date | null;

  /** Why the shutdown was activated. */
  @Column({ name: 'reason', type: 'text' })
  reason: string;

  /** Whether force-close was executed on all open positions. */
  @Column({ name: 'force_close_executed', type: 'boolean', default: false })
  forceCloseExecuted: boolean;

  /** Number of positions that were force-closed (if any). */
  @Column({ name: 'positions_closed', type: 'int', default: 0 })
  positionsClosed: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
