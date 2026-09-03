import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmergencyShutdownEvent } from './entities/emergency-shutdown-event.entity';
import { EmergencyShutdownService } from './emergency-shutdown.service';
import { EmergencyShutdownController } from './emergency-shutdown.controller';
import { AuditModule } from '../audit/audit.module';
import { BrokerModule } from '../broker/broker.module';

@Module({
  imports: [TypeOrmModule.forFeature([EmergencyShutdownEvent]), AuditModule, BrokerModule],
  controllers: [EmergencyShutdownController],
  providers: [EmergencyShutdownService],
  exports: [EmergencyShutdownService],
})
export class EmergencyShutdownModule {}
