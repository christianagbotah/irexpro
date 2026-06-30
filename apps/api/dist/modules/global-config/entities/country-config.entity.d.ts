export declare class CountryConfig {
    id: string;
    countryCode: string;
    countryName: string;
    region: string | null;
    defaultCurrency: string;
    supportedCurrencies: string[];
    enabledPaymentProviders: string[];
    enabledSmsProviders: string[];
    enabledBrokers: string[];
    kycRequirements: Record<string, unknown> | null;
    subscriptionPlanOverrides: Record<string, unknown> | null;
    taxRulesPlaceholder: Record<string, unknown> | null;
    timezone: string;
    locale: string;
    isActive: boolean;
    isBlocked: boolean;
    forexTradingAllowed: boolean;
    specialDisclosureRequired: boolean;
    specialDisclosureText: string | null;
    createdAt: Date;
    updatedAt: Date;
}
