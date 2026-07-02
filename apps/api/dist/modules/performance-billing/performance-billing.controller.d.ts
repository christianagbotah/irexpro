import { RoleName } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { PerformanceFeeBillingCycleService } from './services/performance-fee-billing-cycle.service';
import { CreateBillingCycleDto } from './dto/create-billing-cycle.dto';
import { RunBillingCycleDto } from './dto/run-billing-cycle.dto';
import { CancelBillingCycleDto } from './dto/cancel-billing-cycle.dto';
import { BillingCycleStatus } from './entities/performance-fee-billing-cycle.entity';
type RequestUser = User & {
    roles?: RoleName[];
};
export declare class PerformanceBillingController {
    private readonly svc;
    constructor(svc: PerformanceFeeBillingCycleService);
    createCycle(dto: CreateBillingCycleDto, actor: RequestUser, req: {
        ip?: string;
    }): Promise<import("./entities/performance-fee-billing-cycle.entity").PerformanceFeeBillingCycle>;
    runCycle(id: string, actor: RequestUser, req: {
        ip?: string;
    }): Promise<import("./entities/performance-fee-billing-cycle.entity").PerformanceFeeBillingCycle>;
    runDirect(dto: RunBillingCycleDto, actor: RequestUser, req: {
        ip?: string;
    }): Promise<import("./entities/performance-fee-billing-cycle.entity").PerformanceFeeBillingCycle>;
    listCycles(currentUser: RequestUser, queryUserId?: string, status?: BillingCycleStatus): Promise<import("./entities/performance-fee-billing-cycle.entity").PerformanceFeeBillingCycle[]>;
    getCycle(id: string, currentUser: RequestUser): Promise<import("./entities/performance-fee-billing-cycle.entity").PerformanceFeeBillingCycle>;
    cancelCycle(id: string, dto: CancelBillingCycleDto, actor: RequestUser, req: {
        ip?: string;
    }): Promise<import("./entities/performance-fee-billing-cycle.entity").PerformanceFeeBillingCycle>;
    private isAdmin;
}
export {};
