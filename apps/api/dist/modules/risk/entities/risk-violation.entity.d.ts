import { RiskRejectionCode } from '../interfaces/risk.interface';
export declare class RiskViolation {
    id: string;
    userId: string;
    signalId: string | null;
    rejectionCode: RiskRejectionCode;
    rejectionReason: string;
    riskContext: Record<string, unknown>;
    evaluatedAt: Date;
}
