import { OnModuleDestroy } from '@nestjs/common';
import { DomainEventType } from './enums/domain-event-type.enum';
import { DomainEvent } from './interfaces/domain-event.interface';
type EventHandler<T = Record<string, unknown>> = (event: DomainEvent<T>) => void;
export declare class DomainEventBus implements OnModuleDestroy {
    private readonly logger;
    private readonly emitter;
    constructor();
    publish<T = Record<string, unknown>>(type: DomainEventType, userId: string, payload: T): void;
    subscribe<T = Record<string, unknown>>(type: DomainEventType, handler: EventHandler<T>): () => void;
    onModuleDestroy(): void;
}
export {};
