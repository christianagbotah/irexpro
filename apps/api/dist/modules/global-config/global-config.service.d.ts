import { Repository } from 'typeorm';
import { CountryConfig } from './entities/country-config.entity';
export declare class GlobalConfigService {
    private countryConfigRepo;
    private readonly logger;
    constructor(countryConfigRepo: Repository<CountryConfig>);
    findAllCountries(): Promise<CountryConfig[]>;
    findByCountryCode(countryCode: string): Promise<CountryConfig>;
    isCountrySupported(countryCode: string): Promise<boolean>;
    seedCountries(): Promise<void>;
}
