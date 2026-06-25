import { OnModuleInit } from '@nestjs/common';
import { BrokerAdapterRegistry } from './adapters/broker-adapter.registry';
import { MetaTraderAdapter } from './adapters/metatrader.adapter';
export declare class BrokerModule implements OnModuleInit {
    private registry;
    private metaTraderAdapter;
    constructor(registry: BrokerAdapterRegistry, metaTraderAdapter: MetaTraderAdapter);
    onModuleInit(): void;
}
