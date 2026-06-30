export declare const CURRENCY_MINOR_UNIT_DIGITS: Readonly<Record<string, number>>;
export declare function isSupportedCurrency(currency: string): boolean;
export declare function getMinorUnitDigits(currency: string): number;
export declare class CurrencyMinorUnitService {
    isSupported(currency: string): boolean;
    getMinorUnitDigits(currency: string): number;
}
