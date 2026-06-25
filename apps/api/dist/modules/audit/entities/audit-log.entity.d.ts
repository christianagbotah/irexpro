export declare enum AuditSeverity {
    INFO = "INFO",
    WARNING = "WARNING",
    CRITICAL = "CRITICAL"
}
export declare class AuditLog {
    id: string;
    actorUserId: string | null;
    actorType: string;
    action: string;
    resourceType: string | null;
    resourceId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    metadata: Record<string, unknown> | null;
    severity: AuditSeverity;
    createdAt: Date;
}
