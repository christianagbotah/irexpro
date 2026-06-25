import { BrokerConnection } from './broker-connection.entity';
export declare class BrokerAccount {
    id: string;
    brokerConnectionId: string;
    balance: string;
    equity: string;
    margin: string;
    freeMargin: string;
    marginLevel: string;
    currency: string | null;
    leverage: number | null;
    openPositionsCount: number;
    syncedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    connection: BrokerConnection;
}
