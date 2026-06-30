"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrencyMinorUnitService = exports.CURRENCY_MINOR_UNIT_DIGITS = void 0;
exports.isSupportedCurrency = isSupportedCurrency;
exports.getMinorUnitDigits = getMinorUnitDigits;
const common_1 = require("@nestjs/common");
exports.CURRENCY_MINOR_UNIT_DIGITS = Object.freeze({
    USD: 2, EUR: 2, GBP: 2, CHF: 2, CAD: 2, AUD: 2, NZD: 2,
    CNY: 2, HKD: 2, SGD: 2, INR: 2, BRL: 2, MXN: 2, PLN: 2,
    SEK: 2, NOK: 2, DKK: 2, CZK: 2, HUF: 2, TRY: 2, RUB: 2,
    ZAR: 2, NGN: 2, GHS: 2, KES: 2, EGP: 2, MAD: 2, AED: 2,
    SAR: 2, QAR: 2, THB: 2, MYR: 2, PHP: 2, IDR: 2, ILS: 2,
    JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, XOF: 0, XAF: 0, UGX: 0, RWF: 0,
    KWD: 3, BHD: 3, OMR: 3, JOD: 3, TND: 3,
});
function isSupportedCurrency(currency) {
    if (!currency)
        return false;
    return Object.prototype.hasOwnProperty.call(exports.CURRENCY_MINOR_UNIT_DIGITS, currency.toUpperCase());
}
function getMinorUnitDigits(currency) {
    const code = (currency ?? '').toUpperCase();
    const digits = exports.CURRENCY_MINOR_UNIT_DIGITS[code];
    if (digits === undefined) {
        throw new Error(`Unsupported currency minor-unit mapping: ${currency}`);
    }
    return digits;
}
let CurrencyMinorUnitService = class CurrencyMinorUnitService {
    isSupported(currency) {
        return isSupportedCurrency(currency);
    }
    getMinorUnitDigits(currency) {
        return getMinorUnitDigits(currency);
    }
};
exports.CurrencyMinorUnitService = CurrencyMinorUnitService;
exports.CurrencyMinorUnitService = CurrencyMinorUnitService = __decorate([
    (0, common_1.Injectable)()
], CurrencyMinorUnitService);
//# sourceMappingURL=currency-minor-units.js.map