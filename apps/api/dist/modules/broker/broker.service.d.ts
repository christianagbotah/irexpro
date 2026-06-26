import { Repository } from 'typeorm';
import { BrokerConnection } from './entities/broker-connection.entity';
import { BrokerAccount } from './entities/broker-account.entity';
import { BrokerAdapterRegistry } from './adapters/broker-adapter.registry';
import { CredentialEncryptionService } from './services/credential-encryption.service';
import { OHLCV } from './interfaces/broker-adapter.interface';
import { AuditService } from '../audit/audit.service';
import { ConnectBrokerDto } from './dto/connect-broker.dto';
import { DomainEventBus } from '../events/event-bus.service';
export declare class BrokerService {
    private connectionRepo;
    private accountRepo;
    private adapterRegistry;
    private encryptionService;
    private auditService;
    private readonly eventBus;
    private readonly logger;
    constructor(connectionRepo: Repository<BrokerConnection>, accountRepo: Repository<BrokerAccount>, adapterRegistry: BrokerAdapterRegistry, encryptionService: CredentialEncryptionService, auditService: AuditService, eventBus: DomainEventBus);
    findConnectionsByUser(userId: string): Promise<BrokerConnection[]>;
    findConnectionById(connectionId: string, userId: string): Promise<BrokerConnection>;
    findActiveConnectionForUser(userId: string): Promise<BrokerConnection | null>;
    getSupportedBrokers(): import("./adapters/broker-adapter.registry").BrokerSummary[];
    testCredentials(dto: ConnectBrokerDto, userId: string, ipAddress?: string): Promise<{
        success: boolean;
        accountId?: string;
        errorMessage?: string;
    }>;
    createConnection(dto: ConnectBrokerDto, userId: string, ipAddress?: string): Promise<BrokerConnection>;
    connectBroker(connectionId: string, userId: string, ipAddress?: string): Promise<BrokerConnection>;
    disconnectBroker(connectionId: string, userId: string, ipAddress?: string): Promise<void>;
    deleteConnection(connectionId: string, userId: string, ipAddress?: string): Promise<void>;
    enableLiveTrading(connectionId: string, userId: string, ipAddress?: string): Promise<void>;
    getAllConnectedConnectionIds(): Promise<string[]>;
    healthCheck(connectionId: string): Promise<boolean>;
    getOhlcvForConnection(userId: string, brokerConnectionId: string, instrument: string, timeframe: string, limit: number): Promise<OHLCV[]>;
    hasActiveConnection(userId: string): Promise<boolean>;
    getBrokerAccountState(connectionId: string): Promise<{
        balance: string;
        equity: string;
        freeMargin: string;
        currency: string;
    } | null>;
    private upsertBrokerAccount;
}
