import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RiskProfile } from '../risk/entities/risk-profile.entity';
import { BrokerConnection } from '../broker/entities/broker-connection.entity';
import { User } from '../users/entities/user.entity';
import { TradingActivationService } from './trading-activation.service';
import { TradingActivationController } from './trading-activation.controller';
import { AuditModule } from '../audit/audit.module';
import { GlobalConfigModule } from '../global-config/global-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RiskProfile, BrokerConnection, User]),
    AuditModule,
    GlobalConfigModule,
  ],
  controllers: [TradingActivationController],
  providers: [TradingActivationService],
  exports: [TradingActivationService],
})
export class TradingActivationModule {}
