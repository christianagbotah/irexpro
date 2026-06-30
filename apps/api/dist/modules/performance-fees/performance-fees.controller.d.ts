import { User } from '../users/entities/user.entity';
import { PerformanceFeeService } from './services/performance-fee.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { CalculateAssessmentDto } from './dto/calculate-assessment.dto';
import { CreateLedgerEntryDto } from './dto/create-ledger-entry.dto';
export declare class PerformanceFeesController {
    private readonly svc;
    constructor(svc: PerformanceFeeService);
    getPolicies(): Promise<import("./entities/performance-fee-policy.entity").PerformanceFeePolicy[]>;
    createPolicy(dto: CreatePolicyDto, admin: User): Promise<import("./entities/performance-fee-policy.entity").PerformanceFeePolicy>;
    getMyPerformanceSummary(user: User): Promise<{
        performance: import("./entities/trading-account-performance.entity").TradingAccountPerformance | null;
        assessments: import("./entities/performance-fee-assessment.entity").PerformanceFeeAssessment[];
    }>;
    getAssessments(userId?: string): Promise<import("./entities/performance-fee-assessment.entity").PerformanceFeeAssessment[]>;
    calculateAssessment(dto: CalculateAssessmentDto, admin: User): Promise<import("./entities/performance-fee-assessment.entity").PerformanceFeeAssessment>;
    invoiceAssessment(id: string, admin: User): Promise<import("./entities/performance-fee-assessment.entity").PerformanceFeeAssessment>;
    createLedgerEntry(dto: CreateLedgerEntryDto, admin: User): Promise<import("./entities/performance-fee-ledger-entry.entity").PerformanceFeeLedgerEntry>;
}
