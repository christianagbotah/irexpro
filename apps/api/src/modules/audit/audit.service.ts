import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditSeverity } from './entities/audit-log.entity';
import { AuditAction } from '../../common/enums/audit-action.enum';

const AI_SIGNAL_LIFECYCLE_ACTIONS: AuditAction[] = [
  AuditAction.AI_SIGNAL_RECEIVED,
  AuditAction.AI_SIGNAL_IGNORED,
  AuditAction.AI_SIGNAL_RISK_APPROVED,
  AuditAction.AI_SIGNAL_RISK_REJECTED,
  AuditAction.AI_SIGNAL_EXECUTED,
  AuditAction.AI_SIGNAL_EXECUTION_FAILED,
];

export interface CreateAuditLogDto {
  actorUserId?: string;
  actorType?: string;
  action: AuditAction | string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  severity?: AuditSeverity;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  async log(dto: CreateAuditLogDto): Promise<void> {
    try {
      const entry = this.auditLogRepo.create({
        actorUserId: dto.actorUserId ?? null,
        actorType: dto.actorType ?? 'USER',
        action: dto.action,
        resourceType: dto.resourceType ?? null,
        resourceId: dto.resourceId ?? null,
        ipAddress: dto.ipAddress ?? null,
        userAgent: dto.userAgent ?? null,
        metadata: dto.metadata ?? null,
        severity: dto.severity ?? AuditSeverity.INFO,
      });
      await this.auditLogRepo.save(entry);
    } catch (err) {
      // Audit logging must never throw and disrupt the main flow.
      this.logger.error('Failed to write audit log', err);
    }
  }

  /**
   * Return the newest persisted AI signal receipts for a single user.
   *
   * This intentionally starts from AI_SIGNAL_RECEIVED so the Decision Explorer
   * cannot surface another user's signal simply because a downstream audit row
   * contains a coincidentally matching resource identifier.
   */
  async listRecentAiSignalReceipts(userId: string, limit = 25): Promise<AuditLog[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    return this.auditLogRepo.find({
      where: {
        actorUserId: userId,
        action: AuditAction.AI_SIGNAL_RECEIVED,
        resourceType: 'AiSignal',
      },
      order: { createdAt: 'DESC' },
      take: safeLimit,
    });
  }

  /**
   * Load persisted lifecycle evidence only for already user-scoped signal IDs.
   *
   * AI_SIGNAL_EXECUTED uses the Trade as its resource and therefore stores the
   * originating signalId in metadata. All other current lifecycle rows use the
   * AiSignal resource directly. Both paths remain constrained by actor_user_id.
   */
  async listAiSignalLifecycle(userId: string, signalIds: string[]): Promise<AuditLog[]> {
    if (signalIds.length === 0) return [];

    return this.auditLogRepo
      .createQueryBuilder('audit')
      .where('audit.actor_user_id = :userId', { userId })
      .andWhere('audit.action IN (:...actions)', { actions: AI_SIGNAL_LIFECYCLE_ACTIONS })
      .andWhere(
        `(
          (audit.resource_type = :signalResourceType AND audit.resource_id IN (:...signalIds))
          OR (audit.metadata->>'signalId') IN (:...signalIds)
        )`,
        { signalResourceType: 'AiSignal', signalIds },
      )
      .orderBy('audit.created_at', 'ASC')
      .getMany();
  }
}
