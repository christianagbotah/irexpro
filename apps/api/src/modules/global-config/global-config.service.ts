import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CountryConfig } from './entities/country-config.entity';
import { COUNTRY_CONFIG_SEEDS } from './seeds/country-config.seed';

@Injectable()
export class GlobalConfigService {
  private readonly logger = new Logger(GlobalConfigService.name);

  constructor(
    @InjectRepository(CountryConfig)
    private countryConfigRepo: Repository<CountryConfig>,
  ) {}

  async findAllCountries(): Promise<CountryConfig[]> {
    return this.countryConfigRepo.find({
      where: { isActive: true, isBlocked: false },
      order: { countryName: 'ASC' },
    });
  }

  async findByCountryCode(countryCode: string): Promise<CountryConfig> {
    const config = await this.countryConfigRepo.findOne({
      where: { countryCode: countryCode.toUpperCase() },
    });
    if (!config) throw new NotFoundException(`Country configuration not found: ${countryCode}`);
    return config;
  }

  async isCountrySupported(countryCode: string): Promise<boolean> {
    const config = await this.countryConfigRepo.findOne({
      where: { countryCode: countryCode.toUpperCase() },
    });
    return !!config && config.isActive && !config.isBlocked;
  }

  async seedCountries(): Promise<void> {
    for (const seed of COUNTRY_CONFIG_SEEDS) {
      const existing = await this.countryConfigRepo.findOne({
        where: { countryCode: seed.countryCode },
      });
      if (!existing) {
        await this.countryConfigRepo.save(this.countryConfigRepo.create(seed));
        this.logger.log(`Seeded country: ${seed.countryCode}`);
      }
    }
  }
}
