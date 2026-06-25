import { Global, Module } from '@nestjs/common';
import { DomainEventBus } from './event-bus.service';

/**
 * EventsModule — global in-memory domain event bus.
 *
 * Marked @Global() so DomainEventBus is available in every module
 * without explicit imports. This avoids circular dependency chains
 * caused by direct service-to-service WebSocket injection.
 *
 * See: docs/architecture/04-system-architecture.md §7
 */
@Global()
@Module({
  providers: [DomainEventBus],
  exports: [DomainEventBus],
})
export class EventsModule {}
