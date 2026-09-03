import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditSeverity } from './entities/audit-log.entity';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { redactSensitive } from '../../common/utils/redact-sensitive.util';
import { getCorrelationId } from '../../common/utils/request-correlation.util';

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
  correlationId?: string;
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
      // Explicit correlationId is useful for background/queue work. HTTP paths
      // automatically inherit the AsyncLocalStorage request context.
      const correlationId = dto.correlationId ?? getCorrelationId() ?? null;
      const safeMetadata = dto.metadata ? redactSensitive(dto.metadata) : null;

      const entry = this.auditLogRepo.create({
        actorUserId: dto.actorUserId ?? null,
        actorType: dto.actorType ?? 'USER',
        action: dto.action,
        resourceType: dto.resourceType ?? null,
        resourceId: dto.resourceId ?? null,
        correlationId,
        ipAddress: dto.ipAddress ?? null,
        userAgent: dto.userAgent ?? null,
        metadata: safeMetadata,
        severity: dto.severity ?? AuditSeverity.INFO,
      });
      await this.auditLogRepo.save(entry);
    } catch (err) {
      // Audit logging must never throw and disrupt the main flow.
      this.logger.error('Failed to write audit log', err);
    }
  }

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
