import { OnModuleInit } from '@nestjs/common';
import { BrokerAdapterRegistry } from './adapters/broker-adapter.registry';
import { MetaTraderAdapter } from './adapters/metatrader.adapter';
import { PaperBrokerAdapter } from './adapters/paper-broker.adapter';
export declare class BrokerModule implements OnModuleInit {
    private registry;
    private metaTraderAdapter;
    private paperBrokerAdapter;
    constructor(registry: BrokerAdapterRegistry, metaTraderAdapter: MetaTraderAdapter, paperBrokerAdapter: PaperBrokerAdapter);
    onModuleInit(): void;
}
