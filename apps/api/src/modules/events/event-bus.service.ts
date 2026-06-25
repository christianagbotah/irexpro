import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import { DomainEventType } from './enums/domain-event-type.enum';
import { DomainEvent } from './interfaces/domain-event.interface';

type EventHandler<T = Record<string, unknown>> = (event: DomainEvent<T>) => void;

/**
 * DomainEventBus — in-memory event bus for decoupling business modules
 * from the Realtime/WebSocket layer.
 *
 * Business services (ExecutionService, RiskService, BrokerService, TradingService)
 * PUBLISH events here. RealtimeService SUBSCRIBES and forwards to WebSocket clients.
 *
 * This prevents direct import cycles:
 *   ExecutionModule → RealtimeModule → ExecutionModule (would be circular)
 *
 * Architecture: docs/architecture/04-system-architecture.md §7
 */
@Injectable()
export class DomainEventBus implements OnModuleDestroy {
  private readonly logger = new Logger(DomainEventBus.name);
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  /**
   * Publish a domain event to all registered listeners.
   */
  publish<T = Record<string, unknown>>(
    type: DomainEventType,
    userId: string,
    payload: T,
  ): void {
    const event: DomainEvent<T> = { type, userId, payload, timestamp: new Date() };
    this.emitter.emit(type, event);
    this.logger.debug(`Event published: ${type} for user=${userId}`);
  }

  /**
   * Subscribe to a specific domain event type.
   * Returns an unsubscribe function for cleanup.
   */
  subscribe<T = Record<string, unknown>>(
    type: DomainEventType,
    handler: EventHandler<T>,
  ): () => void {
    this.emitter.on(type, handler as EventHandler);
    return () => this.emitter.off(type, handler as EventHandler);
  }

  onModuleDestroy(): void {
    this.emitter.removeAllListeners();
  }
}
