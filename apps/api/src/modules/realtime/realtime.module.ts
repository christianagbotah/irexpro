import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';

/**
 * RealtimeModule — WebSocket gateway and real-time event emission.
 *
 * Depends on:
 *   - EventsModule (global, provides DomainEventBus — no explicit import needed)
 *   - JwtModule (for WsJwtGuard token validation)
 *
 * This module does NOT import ExecutionModule, RiskModule, or BrokerModule
 * directly — it receives their events via the DomainEventBus to avoid
 * circular dependency chains.
 *
 * See: docs/architecture/06-realtime-event-layer.md
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
      }),
    }),
  ],
  providers: [RealtimeGateway, RealtimeService, WsJwtGuard],
  exports: [RealtimeService],
})
export class RealtimeModule {}
