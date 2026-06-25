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
export declare class AuditService {
    private auditLogRepo;
    private readonly logger;
    constructor(auditLogRepo: Repository<AuditLog>);
    log(dto: CreateAuditLogDto): Promise<void>;
}
