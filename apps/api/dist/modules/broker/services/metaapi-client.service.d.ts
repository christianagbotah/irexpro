import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import MetaApi from 'metaapi.cloud-sdk';
export interface MetaApiConnectionEntry {
    account: ReturnType<InstanceType<typeof MetaApi>['metatraderAccountApi']['getAccount']> extends Promise<infer T> ? T : never;
    connection: any;
    connectedAt: Date;
    accountId: string;
}
export declare class MetaApiClientService implements OnModuleDestroy {
    private readonly configService;
    private readonly logger;
    private readonly metaApi;
    private readonly connectionPool;
    private readonly SYNC_TIMEOUT_SECONDS;
    constructor(configService: ConfigService);
    isAvailable(): boolean;
    getOrCreateConnection(metaApiAccountId: string): Promise<any>;
    testAccountAccess(metaApiAccountId: string): Promise<{
        success: boolean;
        accountType?: string;
        currency?: string;
        error?: string;
    }>;
    removeConnection(metaApiAccountId: string): Promise<void>;
    getActiveAccountIds(): string[];
    hasConnection(metaApiAccountId: string): boolean;
    onModuleDestroy(): Promise<void>;
    private assertAvailable;
}
