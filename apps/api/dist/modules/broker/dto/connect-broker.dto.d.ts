import { BrokerMode } from '../interfaces/broker-adapter.interface';
export declare class ConnectBrokerDto {
    brokerId: string;
    accountType: BrokerMode;
    accountId: string;
    apiKey?: string;
    apiSecret?: string;
    serverUrl?: string;
    displayName?: string;
    additionalParams?: Record<string, string>;
}
