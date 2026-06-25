import { IBrokerAdapter } from '../interfaces/broker-adapter.interface';
export interface BrokerSummary {
    brokerId: string;
    brokerName: string;
    supportsDemo: boolean;
}
export declare class BrokerAdapterRegistry {
    private readonly logger;
    private readonly adapters;
    register(adapter: IBrokerAdapter): void;
    getAdapter(brokerId: string): IBrokerAdapter;
    getSupportedBrokers(): BrokerSummary[];
    getSupportedBrokerIds(): string[];
    isSupported(brokerId: string): boolean;
}
