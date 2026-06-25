import { Module } from '@nestjs/common';
import { TradingService } from './trading.service';
import { BrokerModule } from '../broker/broker.module';

@Module({
  imports: [BrokerModule],
  providers: [TradingService],
  exports: [TradingService],
})
export class TradingModule {}
