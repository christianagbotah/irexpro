import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CountryConfig } from './entities/country-config.entity';
import { GlobalConfigController } from './global-config.controller';
import { GlobalConfigService } from './global-config.service';

@Module({
  imports: [TypeOrmModule.forFeature([CountryConfig])],
  controllers: [GlobalConfigController],
  providers: [GlobalConfigService],
  exports: [GlobalConfigService],
})
export class GlobalConfigModule {}
