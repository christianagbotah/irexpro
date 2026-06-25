import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditSeverity } from './entities/audit-log.entity';
import { AuditAction } from '../../common/enums/audit-action.enum';

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
    private auditLogRepo: Repository<AuditLog>,
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
}
