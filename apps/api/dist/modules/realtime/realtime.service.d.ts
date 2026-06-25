import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Server } from 'socket.io';
import { DomainEventBus } from '../events/event-bus.service';
import { RealtimeEvent } from './events/realtime-event.enum';
export declare class RealtimeService implements OnModuleInit, OnModuleDestroy {
    private readonly eventBus;
    private readonly logger;
    private server;
    private readonly unsubscribers;
    constructor(eventBus: DomainEventBus);
    setServer(server: Server): void;
    onModuleInit(): void;
    onModuleDestroy(): void;
    emitToUser(userId: string, event: RealtimeEvent, payload: Record<string, unknown>): void;
    emitToTradingSession(sessionId: string, event: RealtimeEvent, payload: Record<string, unknown>): void;
    emitToAdmins(event: RealtimeEvent, payload: Record<string, unknown>): void;
    private subscribeToEvents;
}
