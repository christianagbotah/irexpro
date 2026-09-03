import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum AuditSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

@Entity({ name: 'audit_logs', schema: 'audit' })
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  @Index()
  actorUserId: string | null;

  @Column({ name: 'actor_type', type: 'varchar', length: 20, default: 'USER' })
  actorType: string;

  @Column({ name: 'action', type: 'varchar', length: 100 })
  @Index()
  action: string;

  @Column({ name: 'resource_type', type: 'varchar', length: 100, nullable: true })
  resourceType: string | null;

  /** Generic resource identifier — varchar to support any entity ID format. */
  @Column({ name: 'resource_id', type: 'varchar', length: 255, nullable: true })
  resourceId: string | null;

  @Column({ name: 'correlation_id', type: 'uuid', nullable: true })
  @Index()
  correlationId: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({
    name: 'severity',
    type: 'enum',
    enum: AuditSeverity,
    default: AuditSeverity.INFO,
  })
  severity: AuditSeverity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  @Index()
  createdAt: Date;
}
