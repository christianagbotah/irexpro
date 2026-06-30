"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const bullmq_1 = require("@nestjs/bullmq");
const core_1 = require("@nestjs/core");
const configuration_1 = require("./config/configuration");
const validation_schema_1 = require("./config/validation.schema");
const all_exceptions_filter_1 = require("./common/filters/all-exceptions.filter");
const logging_interceptor_1 = require("./common/interceptors/logging.interceptor");
const jwt_auth_guard_1 = require("./common/guards/jwt-auth.guard");
const auth_module_1 = require("./modules/auth/auth.module");
const users_module_1 = require("./modules/users/users.module");
const audit_module_1 = require("./modules/audit/audit.module");
const global_config_module_1 = require("./modules/global-config/global-config.module");
const subscriptions_module_1 = require("./modules/subscriptions/subscriptions.module");
const payments_module_1 = require("./modules/payments/payments.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
const broker_module_1 = require("./modules/broker/broker.module");
const ai_module_1 = require("./modules/ai/ai.module");
const risk_module_1 = require("./modules/risk/risk.module");
const execution_module_1 = require("./modules/execution/execution.module");
const trading_module_1 = require("./modules/trading/trading.module");
const events_module_1 = require("./modules/events/events.module");
const realtime_module_1 = require("./modules/realtime/realtime.module");
const strategy_module_1 = require("./modules/strategy/strategy.module");
const health_module_1 = require("./health/health.module");
const market_data_module_1 = require("./modules/market-data/market-data.module");
const ai_engine_client_module_1 = require("./modules/ai-engine-client/ai-engine-client.module");
const performance_fees_module_1 = require("./modules/performance-fees/performance-fees.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                load: [configuration_1.default],
                validationSchema: validation_schema_1.validationSchema,
                validationOptions: { abortEarly: false },
            }),
            bullmq_1.BullModule.forRootAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    connection: {
                        host: configService.get('redis.host', 'localhost'),
                        port: configService.get('redis.port', 6379),
                        password: configService.get('redis.password') || undefined,
                        db: configService.get('redis.db', 0),
                    },
                    prefix: configService.get('redis.keyPrefix', 'irexpro:'),
                }),
            }),
            typeorm_1.TypeOrmModule.forRootAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    type: 'postgres',
                    host: configService.get('database.host'),
                    port: configService.get('database.port'),
                    database: configService.get('database.name'),
                    username: configService.get('database.user'),
                    password: configService.get('database.password'),
                    ssl: configService.get('database.ssl')
                        ? { rejectUnauthorized: false }
                        : false,
                    synchronize: false,
                    logging: configService.get('database.logging'),
                    autoLoadEntities: true,
                    extra: { max: configService.get('database.maxConnections') },
                }),
            }),
            events_module_1.EventsModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            audit_module_1.AuditModule,
            global_config_module_1.GlobalConfigModule,
            subscriptions_module_1.SubscriptionsModule,
            payments_module_1.PaymentsModule,
            notifications_module_1.NotificationsModule,
            broker_module_1.BrokerModule,
            risk_module_1.RiskModule,
            execution_module_1.ExecutionModule,
            trading_module_1.TradingModule,
            strategy_module_1.StrategyModule,
            ai_module_1.AiModule,
            realtime_module_1.RealtimeModule,
            health_module_1.HealthModule,
            market_data_module_1.MarketDataModule,
            ai_engine_client_module_1.AiEngineClientModule,
            performance_fees_module_1.PerformanceFeesModule,
        ],
        providers: [
            { provide: core_1.APP_FILTER, useClass: all_exceptions_filter_1.AllExceptionsFilter },
            { provide: core_1.APP_INTERCEPTOR, useClass: logging_interceptor_1.LoggingInterceptor },
            { provide: core_1.APP_GUARD, useClass: jwt_auth_guard_1.JwtAuthGuard },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map