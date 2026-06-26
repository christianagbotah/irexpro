import { Module } from '@nestjs/common';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';
import { BrokerModule } from '../broker/broker.module';
import { AuditModule } from '../audit/audit.module';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';

@Module({
  imports: [BrokerModule, AuditModule],
  controllers: [MarketDataController],
  providers: [MarketDataService, InternalApiKeyGuard],
  exports: [MarketDataService],
})
export class MarketDataModule {}
