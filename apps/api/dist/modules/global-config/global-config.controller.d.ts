import { GlobalConfigService } from './global-config.service';
export declare class GlobalConfigController {
    private readonly globalConfigService;
    constructor(globalConfigService: GlobalConfigService);
    listCountries(): Promise<import("./entities/country-config.entity").CountryConfig[]>;
    getCountry(countryCode: string): Promise<import("./entities/country-config.entity").CountryConfig>;
}
