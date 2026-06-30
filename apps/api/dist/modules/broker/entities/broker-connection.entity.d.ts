import { BrokerConnectionStatus, BrokerMode } from '../interfaces/broker-adapter.interface';
export declare class BrokerConnection {
    id: string;
    userId: string;
    brokerId: string;
    brokerName: string;
    displayName: string | null;
    accountId: string | null;
    accountType: BrokerMode;
    accountCurrency: string | null;
    accountLeverage: number | null;
    status: BrokerConnectionStatus;
    encryptedCredentials: string | null;
    credentialIv: string | null;
    credentialTag: string | null;
    encryptionKeyId: string | null;
    lastHealthCheckAt: Date | null;
    lastSyncAt: Date | null;
    consecutiveFailureCount: number;
    lastErrorMessage: string | null;
    demoValidated: boolean;
    liveTradingEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}
