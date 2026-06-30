import { BrokerService } from './broker.service';
import { ConnectBrokerDto } from './dto/connect-broker.dto';
import { BrokerConnectionResponseDto } from './dto/broker-connection-response.dto';
export declare class BrokerController {
    private readonly brokerService;
    private readonly logger;
    constructor(brokerService: BrokerService);
    getSupportedBrokers(): import("./adapters/broker-adapter.registry").BrokerSummary[];
    listConnections(userId: string): Promise<BrokerConnectionResponseDto[]>;
    getConnection(connectionId: string, userId: string): Promise<BrokerConnectionResponseDto>;
    testCredentials(dto: ConnectBrokerDto, userId: string): Promise<{
        success: boolean;
        accountId?: string;
        errorMessage?: string;
    }>;
    createConnection(dto: ConnectBrokerDto, userId: string): Promise<BrokerConnectionResponseDto>;
    connectBroker(connectionId: string, userId: string): Promise<BrokerConnectionResponseDto>;
    disconnectBroker(connectionId: string, userId: string): Promise<void>;
    deleteConnection(connectionId: string, userId: string): Promise<void>;
    enableLiveTrading(connectionId: string, userId: string): Promise<void>;
}
