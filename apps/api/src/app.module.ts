import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AuditModule } from './modules/audit/audit.module';
import { GlobalConfigModule } from './modules/global-config/global-config.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { BrokerModule } from './modules/broker/broker.module';
import { AiModule } from './modules/ai/ai.module';
import { RiskModule } from './modules/risk/risk.module';
import { ExecutionModule } from './modules/execution/execution.module';
import { TradingModule } from './modules/trading/trading.module';
import { EventsModule } from './modules/events/events.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { StrategyModule } from './modules/strategy/strategy.module';
import { HealthModule } from './health/health.module';
import { MarketDataModule } from './modules/market-data/market-data.module';
import { AiEngineClientModule } from './modules/ai-engine-client/ai-engine-client.module';
import { PerformanceFeesModule } from './modules/performance-fees/performance-fees.module';
import { BrokerReconciliationModule } from './modules/broker-reconciliation/broker-reconciliation.module';
import { PerformanceBillingModule } from './modules/performance-billing/performance-billing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: { abortEarly: false },
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host', 'localhost'),
          port: configService.get<number>('redis.port', 6379),
          password: configService.get<string>('redis.password') || undefined,
          db: configService.get<number>('redis.db', 0),
        },
        prefix: configService.get<string>('redis.keyPrefix', 'irexpro:'),
      }),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        database: configService.get<string>('database.name'),
        username: configService.get<string>('database.user'),
        password: configService.get<string>('database.password'),
        ssl: configService.get<boolean>('database.ssl') ? { rejectUnauthorized: false } : false,
        synchronize: false,
        logging: configService.get<boolean>('database.logging'),
        autoLoadEntities: true,
        extra: { max: configService.get<number>('database.maxConnections') },
      }),
    }),
    EventsModule,
    AuthModule,
    UsersModule,
    AuditModule,
    GlobalConfigModule,
    SubscriptionsModule,
    PaymentsModule,
    NotificationsModule,
    BrokerModule,
    RiskModule,
    ExecutionModule,
    TradingModule,
    StrategyModule,
    AiModule,
    RealtimeModule,
    HealthModule,
    MarketDataModule,
    AiEngineClientModule,
    PerformanceFeesModule,
    BrokerReconciliationModule,
    PerformanceBillingModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
