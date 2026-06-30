import { RoleName } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { BrokerTradeReconciliationService } from './services/broker-trade-reconciliation.service';
import { RunReconciliationDto } from './dto/run-reconciliation.dto';
type RequestUser = User & {
    roles?: RoleName[];
};
export declare class BrokerReconciliationController {
    private readonly svc;
    constructor(svc: BrokerTradeReconciliationService);
    runReconciliation(dto: RunReconciliationDto, actor: RequestUser, req: {
        ip?: string;
    }): Promise<import("./entities/broker-trade-reconciliation-run.entity").BrokerTradeReconciliationRun>;
    getRuns(currentUser: RequestUser, queryUserId?: string): Promise<import("./entities/broker-trade-reconciliation-run.entity").BrokerTradeReconciliationRun[]>;
    getReconciledTrades(currentUser: RequestUser, queryUserId?: string, brokerConnectionId?: string): Promise<import("./entities/broker-reconciled-trade.entity").BrokerReconciledTrade[]>;
}
export {};
