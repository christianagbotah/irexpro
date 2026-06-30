import { BrokerConnectionStatus, BrokerMode } from '../interfaces/broker-adapter.interface';
export declare class BrokerConnectionResponseDto {
    id: string;
    brokerId: string;
    brokerName: string;
    displayName: string | null;
    accountId: string | null;
    accountType: BrokerMode;
    accountCurrency: string | null;
    accountLeverage: number | null;
    status: BrokerConnectionStatus;
    demoValidated: boolean;
    liveTradingEnabled: boolean;
    lastHealthCheckAt: Date | null;
    lastSyncAt: Date | null;
    lastErrorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
}
